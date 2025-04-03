import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

app.get("/", async (c) => {
  const imageUrl = resolve(__dirname, "../assets/habeck.jpg");
  const image = await readFile(imageUrl);
  const bytes = Buffer.from(image.buffer);

  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  const str = textDecoder.decode(bytes);
  const bytesAgain = textEncoder.encode(str);

  const blob = new Blob([bytesAgain], { type: "image/jpeg" });

  return new Response(blob);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
