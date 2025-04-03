import type { CacheValue } from "../Uncached";
import {
  isArray,
  isBlob,
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isString,
  isUint8Array,
} from "./typeGuards";

export function calculateByteSize(key: string, value: CacheValue): number {
  let size: number = 0;
  if (isString(value)) {
    size = new TextEncoder().encode(value).length;
  } else if (isNumber(value)) {
    size = 8;
  } else if (isBoolean(value)) {
    size = 4;
  } else if (isNull(value)) {
    size = 4;
  } else if (isUint8Array(value)) {
    size = value.byteLength;
  } else if (isBlob(value)) {
    size = value.size;
  } else if (isArray(value)) {
    let size: number = 0;
    for (const item of value as CacheValue[]) {
      size += calculateByteSize(key, item);
    }
    return size;
  } else if (isObject(value)) {
    size = new TextEncoder().encode(JSON.stringify(value)).length;
  } else {
    throw new Error(`Unsupported value type: ${typeof value}`);
  }
  const keySize = new TextEncoder().encode(key).length;
  const ttlSize = 8;
  const tsSize = 8;
  const typeSize = 8;

  return size + keySize + ttlSize + tsSize + typeSize;
}
