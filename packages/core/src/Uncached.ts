import { type StorageAdapter } from "./utils/storageAdapter";
import { decode, encode } from "./utils/encoding";
import { calculateByteSize } from "./utils/byteSize";
import { isCacheEntryCompressed } from "./utils/typeGuards";
import {
  noopCompressionAdapter,
  type CompressionAdapter,
} from "./utils/compressionAdapter";

export type CacheKey = string;

export type CacheValue =
  | string
  | number
  | boolean
  | object
  | Blob
  | Uint8Array
  | null
  | CacheValue[];

export enum CacheValueType {
  String = 0,
  Number = 1,
  Boolean = 2,
  Object = 3,
  Blob = 4,
  Uint8Array = 5,
  Null = 6,
  Array = 7,
}

export interface CacheValueBase {
  compressed: boolean;
}

export interface CacheDataCompressed extends CacheValueBase {
  type: CacheValueType;
  value: string;
  compressed: true;
}

export interface CacheDataUncompressed<T extends CacheValue = CacheValue>
  extends CacheValueBase {
  value: T;
  compressed: false;
}

export interface CacheEntryBase<T extends CacheValue = CacheValue> {
  compressed: boolean;
  ttl: number;
  created: number;
  accessed: number;
  size: number;
  data: CacheDataCompressed | CacheDataUncompressed<T>;
  compressInMemory: boolean;
  compressInStorage: boolean;
}

export interface CacheEntryCompressed extends CacheEntryBase {
  compressed: true;
  data: CacheDataCompressed;
}

export interface CacheEntryUncompressed<T extends CacheValue = CacheValue>
  extends CacheEntryBase<T> {
  compressed: false;
  data: CacheDataUncompressed<T>;
}

export type CacheEntry<T extends CacheValue = CacheValue> =
  | CacheEntryCompressed
  | CacheEntryUncompressed<T>;

export interface UncachedOptions {
  defaultTtl?: number; // in seconds
  maxTtl?: number; // in seconds
  maxSize?: number; // in bytes
  cleanupInterval?: number; // in milliseconds
  storageAdapter?: StorageAdapter;
  compressInMemory?: boolean;
  compressInStorage?: boolean;
  hydrate?: boolean;
  blockingStorage?: {
    hydrate?: boolean;
    set?: boolean;
    delete?: boolean;
    clear?: boolean;
    cleanup?: boolean;
  };
  fallbackToStorage?: boolean;
  hydrationBlocking?: boolean;
  compressionAdapter?: CompressionAdapter;
}

console.log("test");

type ISetOverload = {
  <T extends CacheValue = CacheValue>(
    key: CacheKey,
    value: T,
    ttl?: number,
    compressInMemory?: boolean,
    compressInStorage?: boolean
  ): Promise<CacheEntryCompressed | CacheEntryUncompressed<T>>;
  <T extends CacheValue = CacheValue>(
    key: CacheKey,
    value: T,
    ttl?: number,
    compressInMemory?: false,
    compressInStorage?: boolean
  ): Promise<CacheEntryUncompressed<T>>;
  <T extends CacheValue = CacheValue>(
    key: CacheKey,
    value: T,
    ttl?: number,
    compressInMemory?: true,
    compressInStorage?: boolean
  ): Promise<CacheEntryCompressed>;
};

export class Uncached {
  #defaultTtl: number;
  #maxSize: number;
  #size: number;
  #cleanupInterval: number;
  #cleanupIntervalId: ReturnType<typeof setInterval>;
  #storageAdapter: StorageAdapter | undefined;
  #compressionAdapter: CompressionAdapter;
  #compressInMemory: boolean;
  #compressInStorage: boolean;
  #hydrationEnabled: boolean;
  #blockingStorage: {
    hydrate: boolean;
    set: boolean;
    delete: boolean;
    clear: boolean;
    cleanup: boolean;
  };
  #fallbackToStorage: boolean;
  #cache: Map<CacheKey, CacheEntry>;

  constructor(options: UncachedOptions | undefined) {
    this.#defaultTtl = options?.defaultTtl ?? 1000 * 60; // 1 minute
    this.#maxSize = options?.maxSize ?? 1024 * 1024 * 10; // 10MB
    this.#cache = new Map<CacheKey, CacheEntry>();
    this.#size = 0;
    this.#cleanupInterval = options?.cleanupInterval ?? 60; // 1 minute
    this.#cleanupIntervalId = setInterval(
      async () => await this.#cleanup(),
      this.#cleanupInterval
    );
    this.#storageAdapter = options?.storageAdapter;
    this.#compressInMemory = options?.compressInMemory ?? true;
    this.#compressInStorage = options?.compressInStorage ?? false;
    this.#hydrationEnabled = options?.hydrate ?? true;
    this.#blockingStorage = {
      hydrate: options?.blockingStorage?.hydrate ?? false,
      set: options?.blockingStorage?.set ?? false,
      delete: options?.blockingStorage?.delete ?? false,
      clear: options?.blockingStorage?.clear ?? false,
      cleanup: options?.blockingStorage?.cleanup ?? false,
    };
    this.#compressionAdapter =
      options?.compressionAdapter ?? noopCompressionAdapter;
    this.#fallbackToStorage = options?.fallbackToStorage ?? true;

    if (this.#hydrationEnabled) {
      if (this.#blockingStorage.hydrate) {
        this.#hydrate().catch((e) => {
          console.error("Error hydrating cache", e);
        });
      } else {
        void this.#hydrate();
      }
    }
  }

  #hydrate = async () => {
    const values = await this.#storageAdapter?.hydrate(
      this.#maxSize,
      this.#compressionAdapter
    );
    if (!values) return;
    for (const [key, value] of Object.entries(values)) {
      this.#cache.set(key, value);
    }
  };

  destroy = async () => {
    clearInterval(this.#cleanupIntervalId);
    this.#cache.clear();
    this.#size = 0;
  };

  #compress = async <T extends CacheValue>(
    value: T
  ): Promise<CacheDataCompressed> => {
    const { type, value: encodedValue } = await encode(value);
    const compressed = await this.#compressionAdapter.compress(encodedValue);
    return {
      type,
      value: compressed,
      compressed: true,
    };
  };

  #decompress = async <T extends CacheValue = CacheValue>(
    value: CacheDataUncompressed<T> | CacheDataCompressed
  ): Promise<T> => {
    const { value: encodedValue, compressed } = value;
    if (compressed) {
      const { type } = value;
      return decode({
        value: await this.#compressionAdapter.decompress(encodedValue),
        type,
      }) as T;
    }
    return encodedValue as T;
  };

  #cleanupStorage = async (): Promise<void> => {
    if (this.#blockingStorage.cleanup) {
      void this.#storageAdapter?.cleanup();
    } else {
      await this.#storageAdapter?.cleanup();
    }
  };

  #removeExpiredEntries = (now: number): void => {
    for (const [key, entry] of this.#cache.entries()) {
      if (now - entry.created > entry.ttl) {
        this.#cache.delete(key);
        this.#updateSize(this.#size - entry.size);
      }
    }
  };

  #cleanup = async (): Promise<void> => {
    const now = Date.now();
    this.#removeExpiredEntries(now);

    await this.#cleanupStorage();
  };

  #updateSize = (newSize: number) => {
    if (newSize !== this.#size) {
      this.#size = newSize;
    }
  };

  #getSize = (key: string, value: CacheValue): number => {
    return calculateByteSize(key, value);
  };

  #makeSpace = (space: number) => {
    let removedSize: number = 0;
    this.#cache.forEach((val, key) => {
      this.#cache.delete(key);
      removedSize += val.size;
      if (removedSize >= space) {
        return;
      }
    });
    return removedSize;
  };

  #setStorage = async <T extends CacheValue>(
    key: CacheKey,
    entry: CacheEntry<T>
  ) => {
    if (this.#blockingStorage.set) {
      void this.#storageAdapter?.set(key, entry, this.#compressionAdapter);
    } else {
      await this.#storageAdapter?.set(key, entry, this.#compressionAdapter);
    }
  };

  #setCache = <T extends CacheValue>(key: CacheKey, entry: CacheEntry<T>) => {
    this.#cache.set(key, entry);
    this.#updateSize(this.#size + entry.size);
    if (this.#size + entry.size > this.#maxSize) {
      this.#makeSpace(this.#size + entry.size - this.#maxSize);
    }
  };

  set = (async <T extends CacheValue>(
    key: CacheKey,
    value: T,
    ttl: number = this.#defaultTtl,
    compressInMemory: boolean = this.#compressInMemory,
    compressInStorage: boolean = this.#compressInStorage
  ) => {
    const baseEntry: Omit<CacheEntry<T>, "data" | "size" | "compressed"> = {
      ttl,
      created: Date.now(),
      accessed: Date.now(),
      compressInMemory,
      compressInStorage,
    };

    let entry: CacheEntryCompressed | CacheEntryUncompressed<T>;
    entry = {
      ...baseEntry,
      data: {
        value,
        compressed: false,
      },
      size: this.#getSize(key, value),
      compressed: false,
    } satisfies CacheEntryUncompressed<T>;

    if (compressInMemory) {
      const data = await this.#compress<T>(value);
      entry = {
        ...baseEntry,
        data,
        size: this.#getSize(key, data.value),
        compressed: true,
      } satisfies CacheEntryCompressed;
    }

    if (entry.size > this.#maxSize) {
      throw new Error("Value is too large");
    }

    this.#setCache(key, entry);
    await this.#setStorage(key, entry);

    return entry;
  }) as ISetOverload;

  async get<T extends CacheValue>(key: CacheKey): Promise<T | undefined> {
    let entry: CacheEntry<T> | undefined;
    entry = this.#cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      if (!this.#fallbackToStorage) {
        return undefined;
      }
      const storageEntry = await this.#storageAdapter?.get<T>(
        key,
        this.#compressionAdapter
      );
      if (!storageEntry) {
        return undefined;
      }

      let uncompressedEntry: CacheEntryUncompressed<T>;
      let compressedEntry: CacheEntryCompressed | undefined;

      if (isCacheEntryCompressed(storageEntry)) {
        compressedEntry = storageEntry;
        const value = await this.#decompress<T>(storageEntry.data);
        uncompressedEntry = {
          ...storageEntry,
          data: {
            value,
            compressed: false,
          },
          size: this.#getSize(key, value),
          compressed: false,
        } satisfies CacheEntryUncompressed<T>;
      } else {
        uncompressedEntry = storageEntry;
      }

      if (storageEntry.compressInMemory) {
        if (!compressedEntry) {
          compressedEntry = {
            ...uncompressedEntry,
            data: await this.#compress(uncompressedEntry.data.value),
            compressed: true,
          } satisfies CacheEntryCompressed;
        }

        entry = compressedEntry;
      } else {
        entry = uncompressedEntry;
      }
    }

    entry.accessed = Date.now();
    this.#setCache(key, entry);

    return this.#decompress<T>(entry.data);
  }

  #deleteStorage = async (key: CacheKey) => {
    if (this.#blockingStorage.delete) {
      void this.#storageAdapter?.delete(key);
    } else {
      await this.#storageAdapter?.delete(key);
    }
  };

  delete = async (key: CacheKey) => {
    const entry = this.#cache.get(key);
    if (!entry) return;
    this.#cache.delete(key);
    await this.#deleteStorage(key);
    this.#updateSize(this.#size - entry.size);
  };

  #clearStorage = async () => {
    if (this.#blockingStorage.clear) {
      void this.#storageAdapter?.clear();
    } else {
      await this.#storageAdapter?.clear();
    }
  };

  clear = async () => {
    this.#cache.clear();
    await this.#clearStorage();
    this.#updateSize(0);
  };
}
