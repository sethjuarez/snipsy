import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import test from "node:test";

import {
  SnipsyClient,
  SnipsyControlError,
  defaultDescriptorPath,
  sendRequest,
  validateDescriptor,
  validateDescriptorForPlatform,
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

test("resolves the macOS descriptor path from Application Support", () => {
  assert.equal(
    defaultDescriptorPath("darwin", {}, "/Users/seth"),
    "/Users/seth/Library/Application Support/dev.snipsy.app/stream-deck-control.json",
  );
});

test("resolves the Linux descriptor path from XDG_DATA_HOME", () => {
  assert.equal(
    defaultDescriptorPath("linux", { XDG_DATA_HOME: "/home/seth/.local/state" }, "/home/seth"),
    "/home/seth/.local/state/dev.snipsy.app/stream-deck-control.json",
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

test("rejects unsupported native transports", () => {
  assert.throws(
    () =>
      validateDescriptor({
        ...descriptor,
        transport: { ...descriptor.transport, kind: "tcp" },
      }),
    (error) => error instanceof SnipsyControlError && error.code === "unsupportedTransport",
  );
});

test("rejects descriptors for the wrong host platform", () => {
  assert.throws(
    () => validateDescriptorForPlatform(descriptor, "darwin"),
    (error) => error instanceof SnipsyControlError && error.code === "unsupportedTransport",
  );
  assert.doesNotThrow(() =>
    validateDescriptorForPlatform(
      {
        ...descriptor,
        transport: { ...descriptor.transport, kind: "unixSocket", endpoint: "/tmp/snipsy.sock" },
      },
      "darwin",
    ),
  );
});

test("sends listButtons requests through the advertised descriptor", async () => {
  const requests = [];
  const client = new SnipsyClient({
    platform: "win32",
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

test("deduplicates bursty listButtons requests per project path", async () => {
  let requestCount = 0;
  let now = 1000;
  const client = new SnipsyClient({
    platform: "win32",
    now: () => now,
    listButtonsCacheTtlMs: 1500,
    readFileText: async () => JSON.stringify(descriptor),
    request: async () => {
      requestCount += 1;
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

  const [first, second] = await Promise.all([client.listButtons(" C:\\demo "), client.listButtons("C:\\demo")]);
  now = 2600;
  await client.listButtons("C:\\demo");

  assert.equal(first, second);
  assert.equal(requestCount, 2);
});

test("sends triggerButton requests with semantic snippet bindings", async () => {
  const requests = [];
  const client = new SnipsyClient({
    platform: "win32",
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

test(
  "round-trips requests over an actual Windows named pipe",
  { skip: process.platform !== "win32" },
  async () => {
    const pipeName = `\\\\.\\pipe\\snipsy-streamdeck-test-${process.pid}-${Date.now()}`;
    const server = createServer((socket) => {
      let request = "";
      socket.on("data", (chunk) => {
        request += chunk.toString("utf8");
        if (!request.includes("\n")) return;
        const command = JSON.parse(request.trim());
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            ok: true,
            result: { command: command.command, projectPath: command.projectPath },
          })}\n`,
        );
      });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(pipeName, resolve);
    });
    try {
      const result = await sendRequest(
        {
          ...descriptor,
          transport: { ...descriptor.transport, endpoint: pipeName },
        },
        { command: "listButtons", projectPath: "C:\\demo" },
      );

      assert.deepEqual(result, { command: "listButtons", projectPath: "C:\\demo" });
    } finally {
      server.close();
    }
  },
);

test(
  "round-trips requests over an actual Unix socket",
  { skip: process.platform === "win32" },
  async () => {
    const socketPath = `/tmp/snipsy-streamdeck-test-${process.pid}-${Date.now()}.sock`;
    const server = createServer((socket) => {
      let request = "";
      socket.on("data", (chunk) => {
        request += chunk.toString("utf8");
        if (!request.includes("\n")) return;
        const command = JSON.parse(request.trim());
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            ok: true,
            result: { command: command.command, projectPath: command.projectPath },
          })}\n`,
        );
      });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    try {
      const result = await sendRequest(
        {
          ...descriptor,
          transport: { ...descriptor.transport, kind: "unixSocket", endpoint: socketPath },
        },
        { command: "listButtons", projectPath: "/Users/seth/demo" },
      );

      assert.deepEqual(result, { command: "listButtons", projectPath: "/Users/seth/demo" });
    } finally {
      server.close();
      await rm(socketPath, { force: true });
    }
  },
);

test("property inspector includes the action uuid in sendToPlugin messages", async () => {
  const source = await readFile(
    new URL("../com.snipsy.streamdeck.sdPlugin/ui/property-inspector.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /actionUuid = JSON\.parse\(actionInfo\)\.action/);
  assert.match(source, /event: "sendToPlugin", action: actionUuid, context, payload/);
});

test("plugin key refresh surfaces stale and offline states", async () => {
  const source = await readFile(new URL("../src/plugin.ts", import.meta.url), "utf8");

  assert.match(source, /client\.listButtons\(settings\.projectPath\)/);
  assert.match(source, /Stale\\nBinding/);
  assert.match(source, /Open\\nSnipsy/);
  assert.match(source, /Snipsy\\nOffline/);
  assert.match(source, /Snipsy\\nBusy/);
  assert.match(source, /Update\\nSnipsy/);
  assert.match(source, /projectUnavailable/);
  assert.match(source, /snippetNotFound/);
  assert.doesNotMatch(source, /not found\|missing/);
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
