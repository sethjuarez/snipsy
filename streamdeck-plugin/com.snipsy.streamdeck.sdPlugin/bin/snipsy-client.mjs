import { createRequire as __snipsyCreateRequire } from "node:module"; const require = __snipsyCreateRequire(import.meta.url);

// streamdeck-plugin/src/snipsy-client.ts
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
var CONTROL_PROTOCOL_VERSION = 1;
var SnipsyControlError = class extends Error {
  constructor(message, code = "snipsyControlError") {
    super(message);
    this.code = code;
  }
};
var SnipsyClient = class {
  #descriptorPath;
  #timeoutMs;
  #readFileText;
  #request;
  #env;
  #platform;
  #homeDir;
  constructor(options = {}) {
    this.#descriptorPath = options.descriptorPath;
    this.#timeoutMs = options.timeoutMs ?? 5e3;
    this.#readFileText = options.readFileText ?? ((path) => readFile(path, "utf8"));
    this.#request = options.request;
    this.#env = options.env ?? process.env;
    this.#platform = options.platform ?? process.platform;
    this.#homeDir = options.homeDir ?? homedir();
  }
  descriptorPath() {
    if (this.#descriptorPath) {
      return this.#descriptorPath;
    }
    return defaultDescriptorPath(this.#platform, this.#env, this.#homeDir);
  }
  async readDescriptor() {
    let descriptor;
    try {
      descriptor = JSON.parse(await this.#readFileText(this.descriptorPath()));
    } catch (error) {
      throw new SnipsyControlError(
        `Snipsy is not running or its Stream Deck descriptor cannot be read: ${error}`,
        "descriptorUnavailable"
      );
    }
    validateDescriptor(descriptor);
    return descriptor;
  }
  async status() {
    return this.#send({ command: "status" });
  }
  async listButtons(projectPath) {
    if (!projectPath.trim()) {
      throw new SnipsyControlError("Project path is required before listing buttons.", "missingProjectPath");
    }
    return this.#send({ command: "listButtons", projectPath });
  }
  async triggerButton(projectPath, snippetId, snippetType) {
    if (!projectPath.trim() || !snippetId.trim()) {
      throw new SnipsyControlError("Project path and snippet binding are required.", "missingBinding");
    }
    return this.#send({ command: "triggerButton", projectPath, snippetId, snippetType });
  }
  async #send(command) {
    const descriptor = await this.readDescriptor();
    if (this.#request) {
      return this.#request(descriptor, command);
    }
    return sendRequest(descriptor, command, this.#timeoutMs);
  }
};
function defaultDescriptorPath(platform, env, homeDir) {
  if (platform === "win32") {
    const appData = env.APPDATA;
    if (!appData) {
      throw new SnipsyControlError("APPDATA is not set; cannot find Snipsy descriptor.", "descriptorPathUnavailable");
    }
    return join(appData, "dev.snipsy.app", "stream-deck-control.json");
  }
  if (platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "dev.snipsy.app", "stream-deck-control.json");
  }
  return join(
    env.XDG_DATA_HOME ?? join(homeDir, ".local", "share"),
    "dev.snipsy.app",
    "stream-deck-control.json"
  );
}
function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || !descriptor.transport) {
    throw new SnipsyControlError("Snipsy descriptor is malformed.", "invalidDescriptor");
  }
  if (descriptor.app !== "snipsy") {
    throw new SnipsyControlError("Descriptor does not belong to Snipsy.", "invalidDescriptor");
  }
  if (descriptor.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
    throw new SnipsyControlError(
      `Unsupported Snipsy Stream Deck protocol: ${descriptor.protocolVersion}`,
      "unsupportedProtocol"
    );
  }
  if (!descriptor.transport.active || descriptor.transport.status !== "listening") {
    throw new SnipsyControlError(
      `Snipsy Stream Deck transport is ${descriptor.transport.status}.`,
      "transportUnavailable"
    );
  }
  if (!descriptor.transport.endpoint) {
    throw new SnipsyControlError("Snipsy descriptor is missing a transport endpoint.", "invalidDescriptor");
  }
}
async function sendRequest(descriptor, command, timeoutMs = 5e3) {
  const line = await sendLine(descriptor.transport.endpoint, JSON.stringify(command), timeoutMs);
  const response = JSON.parse(line);
  if (response.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
    throw new SnipsyControlError("Snipsy returned an unsupported protocol version.", "unsupportedProtocol");
  }
  if (!response.ok) {
    throw new SnipsyControlError(
      response.error?.message ?? "Snipsy Stream Deck command failed.",
      response.error?.code ?? "commandFailed"
    );
  }
  return response.result;
}
function sendLine(endpoint, line, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint);
    const chunks = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SnipsyControlError("Timed out waiting for Snipsy control response.", "timeout"));
    }, timeoutMs);
    socket.on("connect", () => {
      socket.write(`${line}
`, "utf8");
    });
    socket.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      const newline = text.indexOf("\n");
      if (newline >= 0) {
        clearTimeout(timer);
        socket.end();
        resolve(text.slice(0, newline));
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      const code = "code" in error ? String(error.code) : "";
      reject(
        new SnipsyControlError(
          `Failed to reach Snipsy control transport: ${error.message}`,
          code === "ENOENT" || code === "ECONNREFUSED" ? "descriptorUnavailable" : "transportError"
        )
      );
    });
    socket.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text) {
        clearTimeout(timer);
        resolve(text);
      }
    });
  });
}
export {
  CONTROL_PROTOCOL_VERSION,
  SnipsyClient,
  SnipsyControlError,
  defaultDescriptorPath,
  sendRequest,
  validateDescriptor
};
