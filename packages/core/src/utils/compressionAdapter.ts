export interface CompressionAdapter {
  compress: (value: string) => Promise<string>;
  decompress: (value: string) => Promise<string>;
}

export const noopCompressionAdapter: CompressionAdapter = {
  compress: async (value) => value,
  decompress: async (value) => value,
};
