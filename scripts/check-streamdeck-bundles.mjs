import * as esbuild from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const nodeEsmRequireBanner =
  'import { createRequire as __snipsyCreateRequire } from "node:module"; const require = __snipsyCreateRequire(import.meta.url);';

const typecheck = spawnSync(
  process.execPath,
  [resolve("node_modules", "typescript", "bin", "tsc"), "-p", resolve("streamdeck-plugin", "tsconfig.json")],
  { stdio: "inherit" },
);
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

const tempDir = await mkdtemp(join(tmpdir(), "snipsy-streamdeck-bundles-"));
try {
  const expectedPlugin = join(tempDir, "plugin.mjs");
  const expectedClient = join(tempDir, "snipsy-client.mjs");

  await bundle(resolve("streamdeck-plugin", "src", "plugin.ts"), expectedPlugin);
  await bundle(resolve("streamdeck-plugin", "src", "snipsy-client.ts"), expectedClient);

  await assertSameFile(
    expectedPlugin,
    resolve("streamdeck-plugin", "com.snipsy.streamdeck.sdPlugin", "bin", "plugin.mjs"),
  );
  await assertSameFile(
    expectedClient,
    resolve("streamdeck-plugin", "com.snipsy.streamdeck.sdPlugin", "bin", "snipsy-client.mjs"),
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function bundle(entryPoint, outfile) {
  await esbuild.build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    banner: {
      js: nodeEsmRequireBanner,
    },
    sourcemap: false,
    logLevel: "silent",
  });
}

async function assertSameFile(expectedPath, actualPath) {
  const [expected, actual] = await Promise.all([readFile(expectedPath), readFile(actualPath)]);
  if (!expected.equals(actual)) {
    console.error(
      `Stream Deck bundle is out of date: ${actualPath}\nRun \`npm run build:streamdeck\` and commit the updated bin files.`,
    );
    process.exit(1);
  }
}
