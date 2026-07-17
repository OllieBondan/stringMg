import fs from "node:fs/promises";
import path from "node:path";

/**
 * Minimal storage abstraction for the single CSV file.
 * Production uses Vercel Blob (Vercel's filesystem is ephemeral);
 * local dev and tests use a plain file on disk.
 */
export interface BlobStore {
  /** Full file content, or null if the file does not exist yet. */
  read(): Promise<string | null>;
  /** Replace the full file content in one atomic operation. */
  write(content: string): Promise<void>;
}

export function localFileStore(filePath: string): BlobStore {
  return {
    async read() {
      try {
        return await fs.readFile(filePath, "utf8");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async write(content: string) {
      // temp file + rename so a crash mid-write never leaves a partial CSV
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, content, "utf8");
      try {
        // On Windows the rename intermittently fails with EPERM/EBUSY while
        // antivirus or a concurrent reader briefly holds the target — retry.
        for (let attempt = 1; ; attempt++) {
          try {
            await fs.rename(tmp, filePath);
            return;
          } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException).code;
            if ((code === "EPERM" || code === "EACCES" || code === "EBUSY") && attempt < 5) {
              await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
              continue;
            }
            throw err;
          }
        }
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => {});
      }
    },
  };
}

const BLOB_PATHNAME = "records.csv";

/**
 * The store's read-write token. Vercel names it BLOB_READ_WRITE_TOKEN by
 * default, but creating the store with a custom env-var prefix produces
 * e.g. MYSTORE_READ_WRITE_TOKEN — accept any of them.
 */
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => k.endsWith("_READ_WRITE_TOKEN"));
  return key ? process.env[key] : undefined;
}

export function vercelBlobStore(token: string): BlobStore {
  return {
    async read() {
      const { head, BlobNotFoundError } = await import("@vercel/blob");
      let url: string;
      try {
        const meta = await head(BLOB_PATHNAME, { token });
        url = meta.url;
      } catch (err: unknown) {
        // instanceof, not err.name — the SDK's error classes never set .name
        if (err instanceof BlobNotFoundError) return null;
        throw err;
      }
      // unique query string busts the CDN cache so we never read stale data
      const res = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to read blob: HTTP ${res.status}`);
      return res.text();
    },
    async write(content: string) {
      const { put } = await import("@vercel/blob");
      await put(BLOB_PATHNAME, content, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "text/csv",
        token,
      });
    },
  };
}

/**
 * On Vercel without a connected Blob store the filesystem fallback can't work
 * (read-only lambda), so reads act empty and writes explain the actual fix
 * instead of surfacing ENOENT from /var/task.
 */
function unconfiguredVercelStore(): BlobStore {
  return {
    async read() {
      return null;
    },
    async write() {
      throw new Error(
        "Storage is not configured on Vercel — no *_READ_WRITE_TOKEN env var is set. " +
          "In the Vercel dashboard: Storage → Create Database → Blob, connect it to this project. " +
          "If the store is already connected, check Settings → Environment Variables for the " +
          "token and REDEPLOY — the token only reaches deployments made after connecting."
      );
    },
  };
}

let defaultStore: BlobStore | null = null;

export function getStore(): BlobStore {
  if (!defaultStore) {
    const token = blobToken();
    if (token) {
      defaultStore = vercelBlobStore(token);
    } else if (process.env.VERCEL) {
      defaultStore = unconfiguredVercelStore();
    } else {
      defaultStore = localFileStore(path.join(process.cwd(), "data", "records.csv"));
    }
  }
  return defaultStore;
}
