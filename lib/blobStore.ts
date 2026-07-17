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

export function vercelBlobStore(): BlobStore {
  return {
    async read() {
      const { head } = await import("@vercel/blob");
      let url: string;
      try {
        const meta = await head(BLOB_PATHNAME);
        url = meta.url;
      } catch (err: unknown) {
        if ((err as Error).name === "BlobNotFoundError") return null;
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
        "Storage is not configured on Vercel — open your project in the Vercel dashboard, " +
          "go to Storage → Create Database → Blob, connect it to this project, then redeploy."
      );
    },
  };
}

let defaultStore: BlobStore | null = null;

export function getStore(): BlobStore {
  if (!defaultStore) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      defaultStore = vercelBlobStore();
    } else if (process.env.VERCEL) {
      defaultStore = unconfiguredVercelStore();
    } else {
      defaultStore = localFileStore(path.join(process.cwd(), "data", "records.csv"));
    }
  }
  return defaultStore;
}
