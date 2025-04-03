import { build, type BuildConfig, spawn } from "bun";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Note(Chris): This is a hack to make the build server restart on source changes
// @ts-ignore
import * as StorageAdapterBunFile from "../src/index";
noop(StorageAdapterBunFile);

function noop(val: any) {
  return val;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const sharedConfig: BuildConfig = {
  entrypoints: ["./src/index.ts"],
  target: "browser",
  packages: "external",
  splitting: true,
  minify: true,
  sourcemap: "linked",
};

async function buildEsm() {
  console.log("Building ESM...");
  const startTime = performance.now();
  try {
    await build({
      ...sharedConfig,
      outdir: "./dist/esm",
      format: "esm",
    });
  } catch (e) {
    console.error(e);
  }
  const endTime = performance.now();
  console.log(`ESM build completed in ${endTime - startTime}ms`);
}

async function buildCjs() {
  console.log("Building CJS...");
  const startTime = performance.now();
  try {
    await build({
      ...sharedConfig,
      outdir: "./dist/cjs",
      format: "cjs",
    });
  } catch (e) {
    console.error(e);
  }
  const endTime = performance.now();
  console.log(`CJS build completed in ${endTime - startTime}ms`);
}

async function buildTypes(): Promise<void> {
  console.log("Building Types...");
  return new Promise(async (res, reject) => {
    const start = performance.now();
    spawn(["bunx", "tsc", "-p", "tsconfig.json"], {
      cwd: resolve(__dirname, "../"),
      stdout: "inherit",
      stderr: "inherit",
      onExit(proc, exitCode, signalCode, error) {
        if (exitCode === 0) {
          const end = performance.now();
          console.log(`Types build completed in ${end - start}ms`);
          res();
        } else {
          reject(error);
        }
      },
    });
  });
}

async function main() {
  await Promise.all([buildEsm(), buildCjs(), buildTypes()]);
}

["SIGINT", "SIGTERM", "SIGKILL"].forEach((signal) => {
  process.on(signal, () => {
    console.log(`Received ${signal}, exiting...`);
    process.exit(0);
  });
});

main();
