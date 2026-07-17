import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Minimal storage abstraction for the single CSV file.
 * Production uses Vercel Blob (Vercel's filesystem is ephemeral);
 * local dev and tests use a plain file on disk.
 */
export interface BlobRead {
  content: string;
  /** Version marker for conditional writes (compare-and-swap). */
  etag?: string;
}

export interface BlobStore {
  /** Full file content + version, or null if the file does not exist yet. */
  read(): Promise<BlobRead | null>;
  /**
   * Replace the full file content in one atomic operation. When ifMatch is
   * given and the stored version differs, throws StoreConflictError and
   * writes nothing — the caller re-reads and retries on fresh data.
   */
  write(content: string, ifMatch?: string): Promise<void>;
}

/** The store's current version didn't match ifMatch — re-read and retry. */
export class StoreConflictError extends Error {
  constructor() {
    super("Store content changed since it was read");
  }
}

const contentHash = (content: string) => createHash("sha1").update(content).digest("hex");

export function localFileStore(filePath: string): BlobStore {
  async function readRaw(): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  return {
    async read() {
      const content = await readRaw();
      return content === null ? null : { content, etag: contentHash(content) };
    },
    async write(content: string, ifMatch?: string) {
      if (ifMatch) {
        const current = await readRaw();
        if (current === null || contentHash(current) !== ifMatch) {
          throw new StoreConflictError();
        }
      }
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

const DEFAULT_PATHNAME = "records.csv";

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

export function vercelBlobStore(token: string, pathname: string = DEFAULT_PATHNAME): BlobStore {
  // A store is created as either public or private and every call must pass
  // the matching access mode. There is no API to ask which one it is, so we
  // assume public and flip permanently on the first mismatch error.
  let access: "public" | "private" = "public";
  const flip = () => (access = access === "public" ? "private" : "public");
  const accessMismatch = (err: unknown) =>
    err instanceof Error && /access on a (private|public) store/i.test(err.message);

  // Blob READS propagate eventually — a read right after a write can return
  // the previous version. Writes are conditional (ifMatch) and evaluated
  // against the authoritative store, so correctness never depends on read
  // freshness; this cache just makes an instance see its own writes
  // immediately. A later write from another instance has a later uploadedAt
  // and wins.
  let lastWrite: { content: string; etag: string; at: number } | null = null;

  return {
    async read() {
      const { head, get, BlobNotFoundError } = await import("@vercel/blob");
      // head() is an authenticated metadata call that works for both access
      // modes — its not-found is the only trustworthy "store is empty", and
      // its etag is the API-format version marker, the ONLY representation
      // ifMatch accepts (get()'s HTTP etag header is a different one — using
      // it made every conditional write fail).
      const readMeta = async () => {
        try {
          return await head(pathname, { token });
        } catch (err: unknown) {
          // instanceof, not err.name — the SDK's error classes never set .name
          if (err instanceof BlobNotFoundError) return null;
          throw err;
        }
      };

      let meta = await readMeta();
      if (meta === null) {
        // e.g. the very first write hasn't propagated yet
        return lastWrite ? { content: lastWrite.content, etag: lastWrite.etag } : null;
      }

      // The blob exists: from here on a failed read must throw, never pass
      // for an empty store — a caller could otherwise overwrite real data.
      let flipped = false;
      for (let attempt = 0; ; attempt++) {
        let result;
        try {
          result = await get(pathname, { access, token, useCache: false });
        } catch (err) {
          if (flipped) throw err;
          flipped = true;
          flip();
          continue;
        }
        if (!result || result.statusCode !== 200 || !result.stream) {
          throw new Error(`${pathname} exists but could not be read with ${access} access`);
        }
        const content = await new Response(result.stream).text();
        const contentAt = result.blob.uploadedAt.getTime();
        if (lastWrite && lastWrite.at > contentAt) {
          // this instance wrote more recently than the copy the read returned
          return { content: lastWrite.content, etag: lastWrite.etag };
        }
        // Guard against pairing lagging content with a newer version marker
        // (would let a conditional write based on stale data pass): retry
        // briefly while the served content is older than the metadata says.
        // 2s tolerance: last-modified has second precision, etags don't lag.
        if (contentAt >= meta.uploadedAt.getTime() - 2000 || attempt >= 3) {
          lastWrite = null;
          return { content, etag: meta.etag };
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        meta = (await readMeta()) ?? meta;
      }
    },
    async write(content: string, ifMatch?: string) {
      const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
      const doPut = () =>
        put(pathname, content, {
          access,
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          contentType: "text/csv",
          token,
          ...(ifMatch ? { ifMatch } : {}),
        });
      let result;
      try {
        result = await doPut();
      } catch (err) {
        if (err instanceof BlobPreconditionFailedError) throw new StoreConflictError();
        if (!accessMismatch(err)) throw err;
        flip();
        try {
          result = await doPut();
        } catch (err2) {
          if (err2 instanceof BlobPreconditionFailedError) throw new StoreConflictError();
          throw err2;
        }
      }
      lastWrite = { content, etag: result.etag, at: Date.now() };
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

const storeCache = new Map<string, BlobStore>();

/** One store per CSV file (records.csv, deleted.csv, …), cached per process. */
export function getStore(pathname: string = DEFAULT_PATHNAME): BlobStore {
  let store = storeCache.get(pathname);
  if (!store) {
    const token = blobToken();
    if (token) {
      store = vercelBlobStore(token, pathname);
    } else if (process.env.VERCEL) {
      store = unconfiguredVercelStore();
    } else {
      store = localFileStore(path.join(process.cwd(), "data", pathname));
    }
    storeCache.set(pathname, store);
  }
  return store;
}
