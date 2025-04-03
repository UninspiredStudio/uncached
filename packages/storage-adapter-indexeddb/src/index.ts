import { openDB } from "idb";
import type {
  CacheEntry,
  CacheEntryUncompressed,
  CacheKey,
  CacheValue,
  CacheDataCompressed,
  CacheDataUncompressed,
  StorageAdapter,
  CacheEntryCompressed,
  MakeStorageAdapterAsync,
} from "@uncached/core";
import {
  calculateByteSize,
  decode,
  encode,
  isCacheEntryCompressed,
} from "@uncached/core";
import type { CompressionAdapter } from "../../core/dist/types/utils/compressionAdapter";

const VERSION = 1 as const;

interface IndexedDbStorageAdapterSchema<T extends CacheValue = CacheValue> {
  cache: {
    key: CacheKey;
    value: CacheEntry<T>;
    indexes: {
      created: number;
      accessed: number;
    };
  };
}

export interface MakeIndexedDbStorageAdapterOptions {
  name?: string;
  maxStorageSize?: number; // in bytes
}

async function compressData<T extends CacheValue>(
  value: T,
  compressionAdapter: CompressionAdapter
): Promise<CacheDataCompressed> {
  const { type, value: encodedValue } = await encode(value);
  return {
    type,
    value: await compressionAdapter.compress(encodedValue),
    compressed: true,
  };
}

async function decompressData<T extends CacheValue>(
  value: CacheDataUncompressed<T> | CacheDataCompressed,
  compressionAdapter: CompressionAdapter
): Promise<T> {
  const { value: encodedValue, compressed } = value;
  if (compressed) {
    const { type } = value;
    return decode({
      value: await compressionAdapter.decompress(encodedValue as string),
      type,
    }) as T;
  }
  return encodedValue;
}

export const makeIndexedDbStorageAdapter: MakeStorageAdapterAsync = async ({
  name = "uncached-cache",
  maxStorageSize = 1024 * 1024 * 100, // 100MB
}: MakeIndexedDbStorageAdapterOptions): Promise<StorageAdapter> => {
  const db = await openDB<IndexedDbStorageAdapterSchema>(name, VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("cache");
      store.createIndex("created", "created");
      store.createIndex("accessed", "accessed");
    },
  });

  async function init() {
    let currentSize: number = 0;
    const index = db.transaction("cache").store.index("accessed");
    for await (const cursor of index.iterate(null, "next")) {
      const key = cursor.key;
      const value = cursor.value as CacheEntry;
      currentSize += calculateByteSize(key.toString(), value.data.value);
    }
    return currentSize;
  }

  async function makeSpace() {
    const index = db.transaction("cache").store.index("accessed");
    for await (const cursor of index.iterate(null, "prev")) {
      const key = cursor.key;
      const value = cursor.value as CacheEntry;
      await db.delete("cache", key);
      currentSize -= value.size;
      if (currentSize <= maxStorageSize) {
        break;
      }
    }
  }

  let currentSize: number = await init();

  return {
    get: async <T extends CacheValue = CacheValue>(key: CacheKey) => {
      const result = (await db.get("cache", key)) as CacheEntry<T>;
      if (!result) {
        return undefined;
      }

      return result;
    },
    set: async <T extends CacheValue = CacheValue>(
      key: CacheKey,
      value: CacheEntry<T>,
      compressionAdapter: CompressionAdapter
    ) => {
      const baseEntry: Omit<CacheEntry<T>, "data" | "size" | "compressed"> = {
        ttl: value.ttl,
        created: value.created,
        accessed: value.accessed,
        compressInMemory: value.compressInMemory,
        compressInStorage: value.compressInStorage,
      };

      let entry: CacheEntryCompressed | CacheEntryUncompressed<T>;
      if (value.compressInStorage) {
        if (isCacheEntryCompressed(value)) {
          entry = {
            ...baseEntry,
            data: value.data,
            size: value.size,
            compressed: true,
          } satisfies CacheEntryCompressed;
        } else {
          const data = await compressData(value.data.value, compressionAdapter);
          const size = calculateByteSize(key, data.value);
          entry = {
            ...baseEntry,
            data,
            size,
            compressed: true,
          } satisfies CacheEntryCompressed;
        }
      } else {
        if (isCacheEntryCompressed(value)) {
          entry = {
            ...baseEntry,
            data: value.data,
            size: value.size,
            compressed: true,
          } satisfies CacheEntryCompressed;
        } else {
          entry = {
            ...baseEntry,
            data: value.data,
            size: value.size,
            compressed: false,
          } satisfies CacheEntryUncompressed<T>;
        }
      }

      if (currentSize + value.size > maxStorageSize) {
        await makeSpace();
      }

      await db.put(
        "cache",
        {
          key,
          value: entry,
        },
        key
      );
      return entry;
    },
    delete: async (key) => {
      await db.delete("cache", key);
    },
    clear: async () => {
      await db.clear("cache");
    },
    getAllKeys: async () => {
      return (await db.getAllKeys("cache")) as CacheKey[];
    },
    cleanup: async () => {
      const index = db.transaction("cache").store.index("accessed");
      if (currentSize <= maxStorageSize) {
        return;
      }

      for await (const cursor of index.iterate(null, "prev")) {
        const key = cursor.key;
        const value = cursor.value as CacheEntry;
        const created = cursor.value.created;
        const ttl = cursor.value.ttl;
        const now = Date.now();
        if (now - created > ttl) {
          await db.delete("cache", key);
          currentSize -= value.size;
        }
        if (currentSize <= maxStorageSize) {
          break;
        }
        cursor.advance(1);
      }

      if (currentSize > maxStorageSize) {
        const index = db.transaction("cache").store.index("accessed");
        for await (const cursor of index.iterate(null, "prev")) {
          const key = cursor.key;
          const value = cursor.value as CacheEntry;
          await db.delete("cache", key);
          currentSize -= value.size;
          if (currentSize <= maxStorageSize) {
            break;
          }
        }
      }
    },
    hydrate: async <T extends CacheValue = CacheValue>(
      maxMemorySize: number,
      compressionAdapter: CompressionAdapter
    ) => {
      let size: number = 0;
      const index = db.transaction("cache").store.index("accessed");
      const returnObj: Record<string, CacheEntry<T>> = {};

      for await (const cursor of index.iterate(null, "next")) {
        const key = cursor.key as CacheKey;
        const value = cursor.value as CacheEntry;

        const baseEntry: Omit<CacheEntry<T>, "data" | "size" | "compressed"> = {
          ttl: value.ttl,
          created: value.created,
          accessed: value.accessed,
          compressInMemory: value.compressInMemory,
          compressInStorage: value.compressInStorage,
        };

        let entry: CacheEntry<T>;
        if (baseEntry.compressInMemory) {
          if (value.data.compressed) {
            entry = {
              ...baseEntry,
              data: value.data,
              size: value.size,
              compressed: true,
            } satisfies CacheEntryCompressed;
          } else {
            const data = await compressData(
              value.data.value,
              compressionAdapter
            );
            const size = calculateByteSize(key, data.value);
            entry = {
              ...baseEntry,
              data,
              size,
              compressed: true,
            } satisfies CacheEntryCompressed;
          }
        } else {
          if (value.data.compressed) {
            const data = await decompressData<T>(
              value.data,
              compressionAdapter
            );
            const size = calculateByteSize(key, data);
            entry = {
              ...baseEntry,
              data: {
                value: data,
                compressed: false,
              },
              size,
              compressed: false,
            } satisfies CacheEntryUncompressed<T>;
          } else {
            entry = {
              ...baseEntry,
              data: value.data as CacheDataUncompressed<T>,
              size: value.size,
              compressed: false,
            } satisfies CacheEntryUncompressed<T>;
          }
        }
        if (size + entry.size > maxMemorySize) break;

        returnObj[key] = entry;

        size += entry.size;
        cursor.advance(1);
      }

      return returnObj;
    },
  };
};
