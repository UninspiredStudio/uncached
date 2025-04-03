import { Database } from "bun:sqlite";
import type {
  StorageAdapter,
  CacheEntryInternal,
  CacheValueType,
} from "@uncached/core";

export interface StorageAdapterOptions {
  path?: string;
  maxStorageSize?: number; // in bytes
  compress?: boolean;
}

class SqliteCacheEntry implements CacheEntryInternal {
  key: string;
  value: string;
  ttl: number;
  ts: number;
  type: CacheValueType;

  constructor(
    key: string,
    value: string,
    ttl: number,
    ts: number,
    type: CacheValueType
  ) {
    this.key = key;
    this.value = value;
    this.ttl = ttl;
    this.ts = ts;
    this.type = type;
  }
}

export function makeBunSqliteStorageAdapter({
  path = "uncached.sqlite",
  maxStorageSize = 1024 * 1024 * 1024 * 10, // 10GB,
  compress = true,
}: StorageAdapterOptions): StorageAdapter {
  const db = new Database(path, { strict: true, create: true });
  db.run(
    "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT, ttl INTEGER, ts INTEGER, type INTEGER)"
  );

  const storageAdapter: StorageAdapter = {
    get: (key: string) => {
      const query = db
        .query("SELECT * FROM cache WHERE key = $key")
        .as(SqliteCacheEntry);

      const result = query.get({ key });

      query.finalize();
      if (!result) return undefined;
      return result;
    },
    getAll: () => {
      const query = db.query("SELECT * FROM cache").as(SqliteCacheEntry);

      let returnObj: Record<string, CacheEntryInternal> = {};
      for (const row of query.iterate()) {
        returnObj[row.key] = {
          value: row.value,
          ttl: row.ttl,
          ts: row.ts,
          type: row.type,
        };
      }

      query.finalize();

      return returnObj;
    },
    set: (key: string, value: CacheEntryInternal) => {
      const query = db.query(
        "INSERT OR IGNORE INTO cache (key, value, ttl, ts, type) VALUES ($key, $value, $ttl, $ts, $type)"
      );

      const results = query.values({
        key: key,
        value: value.value,
        ttl: value.ttl,
        ts: value.ts,
        type: value.type,
      });

      query.finalize();

      return value;
    },
    delete: (key: string) => {
      const query = db.query("DELETE FROM cache WHERE key = $key");
      const results = query.values({ $key: key });
      query.finalize();
    },
    clear: () => {
      const query = db.query("DELETE FROM cache");
      query.run();
      query.finalize();
    },
    hydrate: (maxSize) => {
      const query = db.query("SELECT * FROM cache").as(SqliteCacheEntry);

      let returnObj: Record<string, CacheEntryInternal> = {};
      for (const row of query.iterate()) {
        returnObj[row.key] = row;
      }
    },
  };

  return storageAdapter;
}
