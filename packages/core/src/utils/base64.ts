export function uint8ArrayToBase64String(uint8: Uint8Array) {
  const binaryString = Array.from(uint8)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return btoa(binaryString);
}

export function base64StringToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}
