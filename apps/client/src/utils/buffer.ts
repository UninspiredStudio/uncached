import { Buffer } from "buffer";

export function makeBuffer(size: number) {
  return Buffer.alloc(size);
}

export function bufferToBase64(buffer: Buffer) {
  return buffer.toString("base64");
}
