import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const checkOnly = process.argv.includes("--check");
const packageJsonPath = resolve("package.json");
const manifestPath = resolve("streamdeck-plugin", "com.snipsy.streamdeck.sdPlugin", "manifest.json");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const manifestText = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  console.error(
    `Cannot sync Stream Deck manifest version from non-stable app version: ${packageJson.version}`,
  );
  process.exit(1);
}

const expectedVersion = `${packageJson.version}.0`;

if (manifest.Version === expectedVersion) {
  console.log(`Stream Deck manifest version is current: ${expectedVersion}`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    `Stream Deck manifest version is out of date: ${manifest.Version} (expected ${expectedVersion}).\n` +
      "Run `npm run sync:streamdeck-version` and commit the updated manifest.",
  );
  process.exit(1);
}

const updatedManifestText = manifestText.replace(
  /("Version"\s*:\s*")[^"]+(")/,
  `$1${expectedVersion}$2`,
);
if (updatedManifestText === manifestText) {
  console.error("Cannot find Stream Deck manifest Version field.");
  process.exit(1);
}

await writeFile(manifestPath, updatedManifestText);
console.log(`Updated Stream Deck manifest version to ${expectedVersion}`);
