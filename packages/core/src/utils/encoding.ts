import { CacheValueType, type CacheValue } from "../Uncached";
import { base64StringToUint8Array, uint8ArrayToBase64String } from "./base64";
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

interface EncodedCacheValue {
  type: CacheValueType;
  value: string;
}

export async function encode(value: CacheValue): Promise<EncodedCacheValue> {
  const startTime = performance.now();
  let entry: EncodedCacheValue;
  if (isString(value)) {
    entry = {
      type: CacheValueType.String,
      value: value,
    };
  } else if (isNumber(value)) {
    entry = {
      type: CacheValueType.Number,
      value: value.toString(),
    };
  } else if (isBoolean(value)) {
    entry = {
      type: CacheValueType.Boolean,
      value: value.toString(),
    };
  } else if (isBlob(value)) {
    entry = {
      type: CacheValueType.Blob,
      value: `${value.type}|${uint8ArrayToBase64String(
        new Uint8Array(await value.arrayBuffer())
      )}`,
    };
  } else if (isUint8Array(value)) {
    entry = {
      type: CacheValueType.Uint8Array,
      value: uint8ArrayToBase64String(value),
    };
  } else if (isArray(value)) {
    entry = {
      type: CacheValueType.Array,
      value: JSON.stringify(value),
    };
  } else if (isObject(value)) {
    entry = {
      type: CacheValueType.Object,
      value: JSON.stringify(value),
    };
  } else if (isNull(value)) {
    entry = {
      type: CacheValueType.Null,
      value: "null",
    };
  } else {
    throw new Error(`Unsupported value type: ${typeof value}`);
  }
  const endTime = performance.now();
  console.log(`Encoded in ${endTime - startTime}ms`);
  return entry;
}

export function decode(encodedEntry: EncodedCacheValue): CacheValue {
  const startTime = performance.now();

  const { type, value } = encodedEntry;
  let decoded: CacheValue;
  switch (type) {
    case CacheValueType.String:
      decoded = value;
      break;
    case CacheValueType.Number:
      decoded = parseFloat(value);
      break;
    case CacheValueType.Boolean:
      decoded = value === "true";
      break;
    case CacheValueType.Null:
      decoded = null;
      break;
    case CacheValueType.Array:
      decoded = JSON.parse(value);
      break;
    case CacheValueType.Object:
      decoded = JSON.parse(value);
      break;
    case CacheValueType.Blob:
      const [mimeType, ...data] = value.split("|");
      const bytes = base64StringToUint8Array(data.join("|"));
      const blob = new Blob([bytes], {
        type: mimeType as string,
      });
      decoded = blob;
      break;
    case CacheValueType.Uint8Array:
      decoded = base64StringToUint8Array(value);
      break;
    default:
      throw new Error(`Unsupported value type: ${type}`);
  }
  const endTime = performance.now();
  console.log(`Decoded in ${endTime - startTime}ms`);
  return decoded;
}
