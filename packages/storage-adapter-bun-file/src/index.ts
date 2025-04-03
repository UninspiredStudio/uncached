import type { CacheEntry, StorageAdapter } from "@uncached/core";
import { file } from "bun";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface MakeBunFileStorageAdapterOptions {
  path?: string;
  compress?: boolean;
  maxStorageSize?: number;
}

function encodeEntry(entry: CacheEntry): string {
  if (isCacheDataUncompressed(entry.value)) {
  }

  return [ttl, ts, type, value].join("|");
}

function decodeEntry(entry: string): CacheEntry {
  const [ttl, ts, type, ...value] = entry.split("|");
  return {
    ttl: parseInt(ttl),
    ts: parseInt(ts),
    type: parseInt(type),
    value: value.join("|"),
  };
}

function makeFileName(key: string): string {
  return `${key}.cache`;
}

async function readCacheFiles(storageDir: string): Promise<string[]> {
  const files = (await readdir(storageDir, { withFileTypes: true })).filter(
    (dirent) => dirent.isFile() && dirent.name.endsWith(".cache")
  );
  return files.map((file) => file.name.replace(".cache", ""));
}

export function makeBunFileStorageAdapter({
  path = ".uncached",
  compress = false,
}: MakeBunFileStorageAdapterOptions): StorageAdapter {
  const storageDir = path;
  mkdir(storageDir, { recursive: true })
    .catch((e) => {
      throw e;
    })
    .then(() => {
      console.log(`Cache Storage directory created at ${storageDir}`);
    });

  async function getValueByKey(key: string): Promise<CacheEntry | undefined> {
    const keyPath = join(storageDir, key);
    const keyFile = file(keyPath, { type: "text/plain" });
    const exists = await keyFile.exists();
    if (!exists) return undefined;
    const entry = await keyFile.text();
    return decodeEntry(entry);
  }

  const adapter: StorageAdapter = {
    get: async (key) => {
      return await getValueByKey(makeFileName(key));
    },
    getAll: async () => {
      const keys = await readCacheFiles(storageDir);
      return Object.fromEntries(
        await Promise.all(
          keys.map(async (key) => {
            return [key, await getValueByKey(makeFileName(key))];
          })
        )
      );
    },
    set: async (key, entry) => {
      const keyFile = file(join(storageDir, makeFileName(key)));
      await keyFile.write(encodeEntry(entry));
      return entry;
    },
    delete: async (key) => {
      const keyFile = file(join(storageDir, makeFileName(key)));
      await keyFile.delete();
    },
    clear: async () => {
      const keys = await readCacheFiles(storageDir);
      await Promise.all(
        keys.map((key) => file(join(storageDir, makeFileName(key))).delete())
      );
    },
    hydrate: async () => {
      const returnObj: Record<string, CacheEntryUncompressed<CacheValue>> = {};
    },
  };

  return adapter;
}
