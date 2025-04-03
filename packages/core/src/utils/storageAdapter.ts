import type {
  CacheEntry,
  CacheEntryCompressed,
  CacheEntryUncompressed,
  CacheKey,
  CacheValue,
} from "../Uncached";
import type { CompressionAdapter } from "./compressionAdapter";
export type GetFn = {
  <T extends CacheValue = CacheValue>(
    key: CacheKey,
    compressionAdapter: CompressionAdapter
  ): Promise<CacheEntryCompressed | CacheEntryUncompressed<T> | undefined>;
};

export type SetFn = {
  <T extends CacheValue = CacheValue>(
    key: CacheKey,
    entry: CacheEntry<T>,
    compressionAdapter: CompressionAdapter
  ): Promise<CacheEntry<T>>;
};

export type HydrateFn = {
  <T extends CacheValue = CacheValue>(
    maxMemorySize: number,
    compressionAdapter: CompressionAdapter
  ): Promise<Record<string, CacheEntry<T>>>;
};

export interface StorageAdapter {
  get: GetFn;
  getAllKeys: () => Promise<CacheKey[]>;
  hydrate: HydrateFn;
  cleanup: () => Promise<void>;
  set: SetFn;
  delete: (key: CacheKey) => Promise<void>;
  clear: () => Promise<void>;
}

export type MakeStorageAdapter = (...params: any[]) => StorageAdapter;

export type MakeStorageAdapterAsync = (
  ...params: any[]
) => Promise<StorageAdapter>;
