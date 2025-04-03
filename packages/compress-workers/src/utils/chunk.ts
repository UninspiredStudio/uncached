export function chunkString(str: string, workerCount: number): string[] {
  const chunkSize = Math.ceil(str.length / workerCount);
  const chunks = new Array(workerCount);
  for (let i = 0; i < workerCount; i++) {
    chunks[i] = str.slice(i * chunkSize, (i + 1) * chunkSize);
  }
  return chunks;
}
