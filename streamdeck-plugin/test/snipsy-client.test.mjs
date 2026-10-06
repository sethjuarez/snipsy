import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  SnipsyClient,
  SnipsyControlError,
  defaultDescriptorPath,
  validateDescriptor,
} from "../com.snipsy.streamdeck.sdPlugin/bin/snipsy-client.mjs";

const descriptor = {
  schemaVersion: 1,
  app: "snipsy",
  appVersion: "0.17.1",
  protocolVersion: 1,
  pid: 42,
  transport: {
    kind: "windowsNamedPipe",
    endpoint: "\\\\.\\pipe\\snipsy-streamdeck-42",
    active: true,
    status: "listening",
  },
};
const pluginDir = new URL("../com.snipsy.streamdeck.sdPlugin/", import.meta.url);

test("resolves the Windows descriptor path from APPDATA", () => {
  assert.equal(
    defaultDescriptorPath("win32", { APPDATA: "C:\\Users\\seth\\AppData\\Roaming" }, "C:\\Users\\seth"),
    "C:\\Users\\seth\\AppData\\Roaming\\dev.snipsy.app\\stream-deck-control.json",
  );
});

test("rejects inactive Snipsy descriptors", () => {
  assert.throws(
    () =>
      validateDescriptor({
        ...descriptor,
        transport: { ...descriptor.transport, active: false, status: "notStarted" },
      }),
    (error) => error instanceof SnipsyControlError && error.code === "transportUnavailable",
  );
});

test("rejects malformed descriptors with a typed control error", () => {
  assert.throws(
    () => validateDescriptor(null),
    (error) => error instanceof SnipsyControlError && error.code === "invalidDescriptor",
  );
});

test("sends listButtons requests through the advertised descriptor", async () => {
  const requests = [];
  const client = new SnipsyClient({
    readFileText: async () => JSON.stringify(descriptor),
    request: async (_descriptor, command) => {
      requests.push(command);
      return [
        {
          id: "snippet-1",
          title: "Snippet 1",
          snippetType: "text",
          iconDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        },
      ];
    },
  });

  const buttons = await client.listButtons("C:\\demo");

  assert.equal(buttons[0].id, "snippet-1");
  assert.deepEqual(requests, [{ command: "listButtons", projectPath: "C:\\demo" }]);
});

test("sends triggerButton requests with semantic snippet bindings", async () => {
  const requests = [];
  const client = new SnipsyClient({
    readFileText: async () => JSON.stringify(descriptor),
    request: async (_descriptor, command) => {
      requests.push(command);
      return { status: "triggered" };
    },
  });

  await client.triggerButton("C:\\demo", "snippet-1", "text");

  assert.deepEqual(requests, [
    {
      command: "triggerButton",
      projectPath: "C:\\demo",
      snippetId: "snippet-1",
      snippetType: "text",
    },
  ]);
});

test("property inspector includes the action uuid in sendToPlugin messages", async () => {
  const source = await readFile(
    new URL("../com.snipsy.streamdeck.sdPlugin/ui/property-inspector.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /actionUuid = JSON\.parse\(actionInfo\)\.action/);
  assert.match(source, /event: "sendToPlugin", action: actionUuid, context, payload/);
});

test("plugin entrypoint loads without CommonJS bundle failures", async () => {
  await cleanupPluginSmokeArtifacts();
  const result = await runNodePluginEntrypoint();
  await cleanupPluginSmokeArtifacts();

  assert.equal(result.timedOut, false);
  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stderr, /Dynamic require of/);
  assert.doesNotMatch(result.stderr, /manifestId/);
});

async function cleanupPluginSmokeArtifacts() {
  await rm(new URL("logs/", pluginDir), { recursive: true, force: true });
  await rm(new URL("e.txt", pluginDir), { force: true });
  await rm(new URL("o.txt", pluginDir), { force: true });
}

function runNodePluginEntrypoint() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["bin/plugin.mjs"], {
      cwd: fileURLToPath(pluginDir),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 5000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}
