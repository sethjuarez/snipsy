import { spawnSync } from "node:child_process";

const generatedFiles = [
  "streamdeck-plugin/com.snipsy.streamdeck.sdPlugin/bin/plugin.mjs",
  "streamdeck-plugin/com.snipsy.streamdeck.sdPlugin/bin/snipsy-client.mjs",
];

const diff = spawnSync("git", ["diff", "--exit-code", "--", ...generatedFiles], {
  stdio: "inherit",
});

if (diff.status !== 0) {
  console.error(
    "\nStream Deck generated bundles are out of date. Run `npm run build:streamdeck` and commit the updated bin files.",
  );
  process.exit(diff.status ?? 1);
}
