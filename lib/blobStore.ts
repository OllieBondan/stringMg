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
  // A store is created as either public or private and every call must pass
  // the matching access mode. There is no API to ask which one it is, so we
  // assume public and flip permanently on the first mismatch error.
  let access: "public" | "private" = "public";
  const flip = () => (access = access === "public" ? "private" : "public");
  const accessMismatch = (err: unknown) =>
    err instanceof Error && /access on a (private|public) store/i.test(err.message);

  // Blob overwrites propagate eventually — a read right after a write can
  // return the previous version. Every write is still synchronous to Blob
  // (durability is never in memory only), but this instance remembers what
  // it wrote last and serves that whenever it is newer than what Blob
  // returned. Another instance's later write has a later uploadedAt and wins.
  let lastWrite: { content: string; at: number } | null = null;

  return {
    async read() {
      const { head, get, BlobNotFoundError } = await import("@vercel/blob");
      try {
        // head() is an authenticated metadata call that works for both access
        // modes — its not-found is the only trustworthy "store is empty".
        await head(BLOB_PATHNAME, { token });
      } catch (err: unknown) {
        // instanceof, not err.name — the SDK's error classes never set .name
        if (err instanceof BlobNotFoundError) {
          // e.g. the very first write hasn't propagated yet
          return lastWrite ? lastWrite.content : null;
        }
        throw err;
      }
      // The blob exists: from here on a failed read must throw, never pass
      // for an empty store — a caller could otherwise overwrite real data.
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await get(BLOB_PATHNAME, { access, token, useCache: false });
          if (!result || result.statusCode !== 200 || !result.stream) {
            throw new Error(`records.csv exists but could not be read with ${access} access`);
          }
          const blobContent = await new Response(result.stream).text();
          if (lastWrite && lastWrite.at > result.blob.uploadedAt.getTime()) {
            return lastWrite.content; // our write is newer than what Blob served
          }
          lastWrite = null;
          return blobContent;
        } catch (err) {
          if (attempt > 0) throw err;
          flip();
        }
      }
    },
    async write(content: string) {
      const { put } = await import("@vercel/blob");
      const doPut = () =>
        put(BLOB_PATHNAME, content, {
          access,
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          contentType: "text/csv",
          token,
        });
      try {
        await doPut();
      } catch (err) {
        if (!accessMismatch(err)) throw err;
        flip();
        await doPut();
      }
      lastWrite = { content, at: Date.now() };
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
