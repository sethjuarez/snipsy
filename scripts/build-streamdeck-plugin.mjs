import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const nodeEsmRequireBanner =
  'import { createRequire as __snipsyCreateRequire } from "node:module"; const require = __snipsyCreateRequire(import.meta.url);';

const pluginOutfile = resolve(
  "streamdeck-plugin",
  "com.snipsy.streamdeck.sdPlugin",
  "bin",
  "plugin.mjs",
);
const clientOutfile = resolve(
  "streamdeck-plugin",
  "com.snipsy.streamdeck.sdPlugin",
  "bin",
  "snipsy-client.mjs",
);

await mkdir(dirname(pluginOutfile), { recursive: true });

const typecheck = spawnSync(
  process.execPath,
  [resolve("node_modules", "typescript", "bin", "tsc"), "-p", resolve("streamdeck-plugin", "tsconfig.json")],
  { stdio: "inherit" },
);
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

await esbuild.build({
  entryPoints: [resolve("streamdeck-plugin", "src", "plugin.ts")],
  outfile: pluginOutfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: nodeEsmRequireBanner,
  },
  sourcemap: false,
  logLevel: "info",
});

await esbuild.build({
  entryPoints: [resolve("streamdeck-plugin", "src", "snipsy-client.ts")],
  outfile: clientOutfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: nodeEsmRequireBanner,
  },
  sourcemap: false,
  logLevel: "info",
});
