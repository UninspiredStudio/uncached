import {
  CacheDataCompressed,
  CacheDataUncompressed,
  CacheEntryCompressed,
  CacheEntryUncompressed,
  CacheValue,
} from "../Uncached";

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isObject(value: unknown): value is object {
  return typeof value === "object";
}

export function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

export function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isCacheDataCompressed(
  value: unknown
): value is CacheDataCompressed {
  return typeof value === "object" && (value as any).compressed === true;
}

export function isCacheDataUncompressed(
  value: unknown
): value is CacheDataUncompressed {
  return typeof value === "object" && (value as any).compressed === false;
}

export function isCacheEntryCompressed(
  value: unknown
): value is CacheEntryCompressed {
  return typeof value === "object" && (value as any).data.compressed === true;
}

export function isCacheEntryUncompressed<T extends CacheValue = CacheValue>(
  value: unknown
): value is CacheEntryUncompressed<T> {
  return typeof value === "object" && (value as any).data.compressed === false;
}
