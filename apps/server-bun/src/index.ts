import { Hono } from "hono";
import { file } from "bun";
import { Uncached } from "uncached";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const app = new Hono();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cache = new Uncached({
  defaultTtl: 1000 * 20,
  cleanupInterval: 1000 * 60 * 10,
  maxSize: 1024 * 1024 * 1024, // 1GV
  // storageAdapter: makeBunFileStorageAdapter({
  //   path: resolve(__dirname, "uncached"),
  // }),
  compress: true,
  hydrate: false,
});

app
  .get("/", async (c) => {
    const result = await cache.get<Blob>("test");
    if (result) {
      return new Response(result, {
        headers: {
          "X-Cache": "HIT",
        },
      });
    }
    const image = file(resolve(__dirname, "../assets/habeck.jpg"));
    const entry = await cache.set("test", image, undefined, false);

    return new Response(image, {
      headers: {
        "X-Cache": "MISS",
      },
    });
  })
  .get("/test", async (c) => {
    const result = await cache.get<string>("test-2");
    if (result) {
      return c.json(
        { result: result },
        {
          headers: {
            "X-Cache": "HIT",
          },
        }
      );
    }

    const data = {
      message: "Hello, world!",
    };

    await cache.set("test-2", data);

    return c.json(
      { result: data },
      {
        headers: {
          "X-Cache": "MISS",
        },
      }
    );
  });

export default {
  port: 3000,
  fetch: app.fetch,
};
