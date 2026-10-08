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
  watchEvents,
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
const windowsClientOptions = {
  platform: "win32",
  env: { APPDATA: "C:\\Users\\seth\\AppData\\Roaming" },
};

test("manifest minimum Stream Deck version supports SDK settings behavior", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", pluginDir), "utf8"));

  assert.equal(manifest.Software.MinimumVersion, "7.1");
});

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
    ...windowsClientOptions,
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

test("sends activeProjectButtons requests through the advertised descriptor", async () => {
  const requests = [];
  const client = new SnipsyClient({
    ...windowsClientOptions,
    readFileText: async () => JSON.stringify(descriptor),
    request: async (_descriptor, command) => {
      requests.push(command);
      return {
        projectPath: "C:\\demo",
        buttons: [
          {
            id: "snippet-1",
            title: "Snippet 1",
            snippetType: "text",
            iconDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
          },
        ],
      };
    },
  });

  const activeProject = await client.activeProjectButtons();

  assert.equal(activeProject.projectPath, "C:\\demo");
  assert.equal(activeProject.buttons[0].id, "snippet-1");
  assert.deepEqual(requests, [{ command: "activeProjectButtons" }]);
});

test("deduplicates bursty listButtons requests per project path", async () => {
  let requestCount = 0;
  let now = 1000;
  const client = new SnipsyClient({
    ...windowsClientOptions,
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
    ...windowsClientOptions,
    readFileText: async () => JSON.stringify(descriptor),
    request: async (_descriptor, command) => {
      requests.push(command);
      return { id: "snippet-1", title: "Snippet 1", snippetType: "text", status: "started" };
    },
  });

  const result = await client.triggerButton("C:\\demo", "snippet-1", "text");

  assert.equal(result.status, "started");
  assert.deepEqual(requests, [
    {
      command: "triggerButton",
      projectPath: "C:\\demo",
      snippetId: "snippet-1",
      snippetType: "text",
    },
  ]);
});

test("sends triggerButton requests with automation bindings", async () => {
  const requests = [];
  const client = new SnipsyClient({
    ...windowsClientOptions,
    readFileText: async () => JSON.stringify(descriptor),
    request: async (_descriptor, command) => {
      requests.push(command);
      return { id: "automation-1", title: "Automation 1", snippetType: "automation", status: "started" };
    },
  });

  const result = await client.triggerButton("C:\\demo", "automation-1", "automation");

  assert.equal(result.status, "started");
  assert.deepEqual(requests, [
    {
      command: "triggerButton",
      projectPath: "C:\\demo",
      snippetId: "automation-1",
      snippetType: "automation",
    },
  ]);
});

test("sends buttonStatus requests with semantic snippet bindings", async () => {
  const requests = [];
  const client = new SnipsyClient({
    ...windowsClientOptions,
    readFileText: async () => JSON.stringify(descriptor),
    request: async (_descriptor, command) => {
      requests.push(command);
      return { active: true };
    },
  });

  const result = await client.buttonStatus("C:\\demo", "snippet-1", "text");

  assert.equal(result.active, true);
  assert.deepEqual(requests, [
    {
      command: "buttonStatus",
      projectPath: "C:\\demo",
      snippetId: "snippet-1",
      snippetType: "text",
    },
  ]);
});

test("subscribes to project button updates through watchProject", async () => {
  const requests = [];
  const client = new SnipsyClient({
    ...windowsClientOptions,
    readFileText: async () => JSON.stringify(descriptor),
    watch: (_descriptor, command, onEvent) => {
      requests.push(command);
      onEvent({
        protocolVersion: 1,
        event: "snipsy.project.snapshot",
        payload: { projectPath: "C:\\demo", buttons: [] },
      });
      return { close: () => undefined };
    },
  });
  const events = [];

  const watcher = await client.watchProject(" C:\\demo ", (event) => events.push(event));
  watcher.close();

  assert.deepEqual(requests, [{ command: "watchProject", projectPath: "C:\\demo" }]);
  assert.equal(events[0].event, "snipsy.project.snapshot");
});

test("parses newline-delimited project watch events", async () => {
  const endpoint =
    process.platform === "win32"
      ? `\\\\.\\pipe\\snipsy-streamdeck-watch-test-${process.pid}-${Date.now()}`
      : `/tmp/snipsy-streamdeck-watch-test-${process.pid}-${Date.now()}.sock`;
  const server = createServer((socket) => {
    let request = "";
    socket.on("data", (chunk) => {
      request += chunk.toString("utf8");
      if (!request.includes("\n")) return;
      const command = JSON.parse(request.trim());
      socket.write(
        `${JSON.stringify({
          protocolVersion: 1,
          event: "snipsy.project.snapshot",
          payload: { projectPath: command.projectPath, buttons: [] },
        })}\n`,
      );
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, resolve);
  });
  try {
    const events = [];
    const errors = [];
    const watcher = watchEvents(
      {
        ...descriptor,
        transport: {
          ...descriptor.transport,
          kind: process.platform === "win32" ? "windowsNamedPipe" : "unixSocket",
          endpoint,
        },
      },
      { command: "watchProject", projectPath: "C:\\demo" },
      (event) => events.push(event),
      (error) => errors.push(error),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    watcher.close();

    assert.equal(errors.length, 0);
    assert.equal(events[0].event, "snipsy.project.snapshot");
    assert.deepEqual(events[0].payload, { projectPath: "C:\\demo", buttons: [] });
  } finally {
    server.close();
    if (process.platform !== "win32") {
      await rm(endpoint, { force: true });
    }
  }
});

test("rejects non-event watch response frames once", async () => {
  const endpoint =
    process.platform === "win32"
      ? `\\\\.\\pipe\\snipsy-streamdeck-watch-response-test-${process.pid}-${Date.now()}`
      : `/tmp/snipsy-streamdeck-watch-response-test-${process.pid}-${Date.now()}.sock`;
  const server = createServer((socket) => {
    socket.on("data", () => {
      socket.end(
        `${JSON.stringify({
          protocolVersion: 1,
          ok: false,
          error: { code: "unknownCommand", message: "Unknown command: watchProject" },
        })}\n`,
      );
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, resolve);
  });
  try {
    const errors = [];
    const watcher = watchEvents(
      {
        ...descriptor,
        transport: {
          ...descriptor.transport,
          kind: process.platform === "win32" ? "windowsNamedPipe" : "unixSocket",
          endpoint,
        },
      },
      { command: "watchProject", projectPath: "C:\\demo" },
      () => undefined,
      (error) => errors.push(error),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    watcher.close();

    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "unknownCommand");
  } finally {
    server.close();
    if (process.platform !== "win32") {
      await rm(endpoint, { force: true });
    }
  }
});

test("reports malformed watch events only once", async () => {
  const endpoint =
    process.platform === "win32"
      ? `\\\\.\\pipe\\snipsy-streamdeck-watch-malformed-test-${process.pid}-${Date.now()}`
      : `/tmp/snipsy-streamdeck-watch-malformed-test-${process.pid}-${Date.now()}.sock`;
  const server = createServer((socket) => {
    socket.on("data", () => {
      socket.end(`${JSON.stringify({ protocolVersion: 1, payload: {} })}\n`);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, resolve);
  });
  try {
    const errors = [];
    const watcher = watchEvents(
      {
        ...descriptor,
        transport: {
          ...descriptor.transport,
          kind: process.platform === "win32" ? "windowsNamedPipe" : "unixSocket",
          endpoint,
        },
      },
      { command: "watchProject", projectPath: "C:\\demo" },
      () => undefined,
      (error) => errors.push(error),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    watcher.close();

    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "invalidEvent");
  } finally {
    server.close();
    if (process.platform !== "win32") {
      await rm(endpoint, { force: true });
    }
  }
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
  assert.match(source, /sendToPlugin\(\{ type: "listButtons" \}\)/);
  assert.match(source, /buttonSelect\.addEventListener\("change", saveBinding\)/);
});

test("plugin key refresh surfaces stale and offline states", async () => {
  const source = await readFile(new URL("../src/plugin.ts", import.meta.url), "utf8");

  assert.match(source, /client\.listButtons\(settings\.projectPath\)/);
  assert.match(source, /client\.activeProjectButtons\(\)/);
  assert.match(source, /client\.watchProject\(/);
  assert.match(source, /snipsy\.project\.snapshot/);
  assert.match(source, /snipsy\.project\.changed/);
  assert.match(source, /Stale\\nBinding/);
  assert.match(source, /Open\\nSnipsy/);
  assert.match(source, /Snipsy\\nOffline/);
  assert.match(source, /Snipsy\\nBusy/);
  assert.match(source, /buttonStatus/);
  assert.match(source, /setState\(active \? 1 : 0\)/);
  assert.match(source, /Stop\\n/);
  assert.match(source, /unknownCommand/);
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
