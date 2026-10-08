import { createConnection } from "node:net";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { readFile } from "node:fs/promises";

export const CONTROL_PROTOCOL_VERSION = 1;

export type SnipsySnippetType = "text" | "video" | "automation";

export interface StreamDeckButton {
  [key: string]: string | undefined;
  id: string;
  title: string;
  snippetType: SnipsySnippetType;
  hotkey?: string;
  iconDataUrl: string;
}

export interface StreamDeckTriggerResult {
  id: string;
  title: string;
  snippetType: SnipsySnippetType;
  status: "started" | "stopped" | "completed";
}

export interface StreamDeckButtonStatus {
  active: boolean;
}

export interface StreamDeckControlDescriptor {
  schemaVersion: number;
  app: string;
  appVersion: string;
  protocolVersion: number;
  pid: number;
  transport: {
    kind: "windowsNamedPipe" | "unixSocket";
    endpoint: string;
    active: boolean;
    status: "notStarted" | "listening" | "startFailed";
  };
}

interface ControlResponse<T> {
  protocolVersion: number;
  ok: boolean;
  result?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface StreamDeckControlEvent<T = unknown> {
  protocolVersion: number;
  event: string;
  payload?: T;
  error?: {
    code: string;
    message: string;
  };
}

type WatchHandle = { close: () => void };

export interface ActiveProjectButtons {
  projectPath: string;
  buttons: StreamDeckButton[];
}

type Command =
  | { command: "status" }
  | { command: "activeProjectButtons" }
  | { command: "listButtons"; projectPath: string }
  | { command: "watchProject"; projectPath: string }
  | {
      command: "buttonStatus";
      projectPath: string;
      snippetId: string;
      snippetType: SnipsySnippetType;
    }
  | {
      command: "triggerButton";
      projectPath: string;
      snippetId: string;
      snippetType: SnipsySnippetType;
    };

export interface SnipsyClientOptions {
  descriptorPath?: string;
  timeoutMs?: number;
  listButtonsCacheTtlMs?: number;
  now?: () => number;
  readFileText?: (path: string) => Promise<string>;
  request?: <T>(descriptor: StreamDeckControlDescriptor, command: Command) => Promise<T>;
  watch?: (
    descriptor: StreamDeckControlDescriptor,
    command: Command,
    onEvent: (event: StreamDeckControlEvent) => void,
    onError: (error: unknown) => void,
  ) => WatchHandle;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}

export class SnipsyControlError extends Error {
  constructor(
    message: string,
    readonly code = "snipsyControlError",
  ) {
    super(message);
  }
}

export class SnipsyClient {
  readonly #descriptorPath?: string;
  readonly #timeoutMs: number;
  readonly #listButtonsCacheTtlMs: number;
  readonly #now: () => number;
  readonly #readFileText: (path: string) => Promise<string>;
  readonly #request?: <T>(descriptor: StreamDeckControlDescriptor, command: Command) => Promise<T>;
  readonly #watch: (
    descriptor: StreamDeckControlDescriptor,
    command: Command,
    onEvent: (event: StreamDeckControlEvent) => void,
    onError: (error: unknown) => void,
  ) => WatchHandle;
  readonly #env: NodeJS.ProcessEnv;
  readonly #platform: NodeJS.Platform;
  readonly #homeDir: string;
  readonly #listButtonsCache = new Map<string, { expiresAt: number; promise: Promise<StreamDeckButton[]> }>();

  constructor(options: SnipsyClientOptions = {}) {
    this.#descriptorPath = options.descriptorPath;
    this.#timeoutMs = options.timeoutMs ?? 5000;
    this.#listButtonsCacheTtlMs = options.listButtonsCacheTtlMs ?? 1500;
    this.#now = options.now ?? Date.now;
    this.#readFileText = options.readFileText ?? ((path) => readFile(path, "utf8"));
    this.#request = options.request;
    this.#watch = options.watch ?? watchEvents;
    this.#env = options.env ?? process.env;
    this.#platform = options.platform ?? process.platform;
    this.#homeDir = options.homeDir ?? homedir();
  }

  descriptorPath(): string {
    if (this.#descriptorPath) {
      return this.#descriptorPath;
    }
    return defaultDescriptorPath(this.#platform, this.#env, this.#homeDir);
  }

  async readDescriptor(): Promise<StreamDeckControlDescriptor> {
    let descriptor: StreamDeckControlDescriptor;
    try {
      descriptor = JSON.parse(await this.#readFileText(this.descriptorPath()));
    } catch (error) {
      throw new SnipsyControlError(
        `Snipsy is not running or its Stream Deck descriptor cannot be read: ${error}`,
        "descriptorUnavailable",
      );
    }
    validateDescriptor(descriptor);
    validateDescriptorForPlatform(descriptor, this.#platform);
    return descriptor;
  }

  async status(): Promise<StreamDeckControlDescriptor> {
    return this.#send<StreamDeckControlDescriptor>({ command: "status" });
  }

  async listButtons(projectPath: string): Promise<StreamDeckButton[]> {
    const normalizedProjectPath = projectPath.trim();
    if (!normalizedProjectPath) {
      throw new SnipsyControlError("Project path is required before listing buttons.", "missingProjectPath");
    }
    const cached = this.#listButtonsCache.get(normalizedProjectPath);
    if (cached && cached.expiresAt > this.#now()) {
      return cached.promise;
    }
    const promise = this.#send<StreamDeckButton[]>({
      command: "listButtons",
      projectPath: normalizedProjectPath,
    }).catch((error) => {
      this.#listButtonsCache.delete(normalizedProjectPath);
      throw error;
    });
    this.#listButtonsCache.set(normalizedProjectPath, {
      expiresAt: this.#now() + this.#listButtonsCacheTtlMs,
      promise,
    });
    return promise;
  }

  async activeProjectButtons(): Promise<ActiveProjectButtons> {
    return this.#send<ActiveProjectButtons>({ command: "activeProjectButtons" });
  }

  async triggerButton(
    projectPath: string,
    snippetId: string,
    snippetType: SnipsySnippetType,
  ): Promise<StreamDeckTriggerResult> {
    if (!projectPath.trim() || !snippetId.trim()) {
      throw new SnipsyControlError("Project path and snippet binding are required.", "missingBinding");
    }
    return this.#send<StreamDeckTriggerResult>({ command: "triggerButton", projectPath, snippetId, snippetType });
  }

  async buttonStatus(
    projectPath: string,
    snippetId: string,
    snippetType: SnipsySnippetType,
  ): Promise<StreamDeckButtonStatus> {
    if (!projectPath.trim() || !snippetId.trim()) {
      throw new SnipsyControlError("Project path and snippet binding are required.", "missingBinding");
    }
    return this.#send<StreamDeckButtonStatus>({ command: "buttonStatus", projectPath, snippetId, snippetType });
  }

  clearListButtonsCache(projectPath?: string): void {
    if (projectPath) {
      this.#listButtonsCache.delete(projectPath.trim());
      return;
    }
    this.#listButtonsCache.clear();
  }

  async watchProject(
    projectPath: string,
    onEvent: (event: StreamDeckControlEvent) => void,
    onError: (error: unknown) => void = () => undefined,
  ): Promise<WatchHandle> {
    const normalizedProjectPath = projectPath.trim();
    if (!normalizedProjectPath) {
      throw new SnipsyControlError("Project path is required before watching a project.", "missingProjectPath");
    }
    const descriptor = await this.readDescriptor();
    return this.#watch(
      descriptor,
      { command: "watchProject", projectPath: normalizedProjectPath },
      onEvent,
      onError,
    );
  }

  async #send<T>(command: Command): Promise<T> {
    const descriptor = await this.readDescriptor();
    if (this.#request) {
      return this.#request<T>(descriptor, command);
    }
    return sendRequest<T>(descriptor, command, this.#timeoutMs);
  }
}

export function defaultDescriptorPath(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homeDir: string,
): string {
  if (platform === "win32") {
    const appData = env.APPDATA;
    if (!appData) {
      throw new SnipsyControlError("APPDATA is not set; cannot find Snipsy descriptor.", "descriptorPathUnavailable");
    }
    return win32.join(appData, "dev.snipsy.app", "stream-deck-control.json");
  }
  if (platform === "darwin") {
    return posix.join(homeDir, "Library", "Application Support", "dev.snipsy.app", "stream-deck-control.json");
  }
  return posix.join(
    env.XDG_DATA_HOME ?? posix.join(homeDir, ".local", "share"),
    "dev.snipsy.app",
    "stream-deck-control.json",
  );
}

export function validateDescriptor(descriptor: StreamDeckControlDescriptor): void {
  if (!descriptor || typeof descriptor !== "object" || !descriptor.transport) {
    throw new SnipsyControlError("Snipsy descriptor is malformed.", "invalidDescriptor");
  }
  if (descriptor.app !== "snipsy") {
    throw new SnipsyControlError("Descriptor does not belong to Snipsy.", "invalidDescriptor");
  }
  if (descriptor.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
    throw new SnipsyControlError(
      `Unsupported Snipsy Stream Deck protocol: ${descriptor.protocolVersion}`,
      "unsupportedProtocol",
    );
  }
  if (!descriptor.transport.active || descriptor.transport.status !== "listening") {
    throw new SnipsyControlError(
      `Snipsy Stream Deck transport is ${descriptor.transport.status}.`,
      "transportUnavailable",
    );
  }
  if (!descriptor.transport.endpoint) {
    throw new SnipsyControlError("Snipsy descriptor is missing a transport endpoint.", "invalidDescriptor");
  }
  if (!["windowsNamedPipe", "unixSocket"].includes(descriptor.transport.kind)) {
    throw new SnipsyControlError(
      `Unsupported Snipsy Stream Deck transport: ${descriptor.transport.kind}`,
      "unsupportedTransport",
    );
  }
}

export function validateDescriptorForPlatform(
  descriptor: StreamDeckControlDescriptor,
  platform: NodeJS.Platform,
): void {
  const expectedKind = platform === "win32" ? "windowsNamedPipe" : "unixSocket";
  if (descriptor.transport.kind !== expectedKind) {
    throw new SnipsyControlError(
      `Snipsy advertised ${descriptor.transport.kind}, but ${platform} requires ${expectedKind}.`,
      "unsupportedTransport",
    );
  }
}

export async function sendRequest<T>(
  descriptor: StreamDeckControlDescriptor,
  command: Command,
  timeoutMs = 5000,
): Promise<T> {
  const line = await sendLine(descriptor.transport.endpoint, JSON.stringify(command), timeoutMs);
  const response = JSON.parse(line) as ControlResponse<T>;
  if (response.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
    throw new SnipsyControlError("Snipsy returned an unsupported protocol version.", "unsupportedProtocol");
  }
  if (!response.ok) {
    throw new SnipsyControlError(
      response.error?.message ?? "Snipsy Stream Deck command failed.",
      response.error?.code ?? "commandFailed",
    );
  }
  return response.result as T;
}

export function watchEvents(
  descriptor: StreamDeckControlDescriptor,
  command: Command,
  onEvent: (event: StreamDeckControlEvent) => void,
  onError: (error: unknown) => void,
): WatchHandle {
  const socket = createConnection(descriptor.transport.endpoint);
  let buffer = "";
  let closed = false;
  let errorNotified = false;

  const notifyError = (error: unknown) => {
    if (errorNotified) {
      return;
    }
    errorNotified = true;
    onError(error);
  };

  socket.on("connect", () => {
    socket.write(`${JSON.stringify(command)}\n`, "utf8");
  });
  socket.on("data", (chunk) => {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : Buffer.from(chunk).toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          const frame = JSON.parse(line);
          if (isControlResponse(frame)) {
            throw new SnipsyControlError(
              frame.error?.message ?? "Snipsy does not support project watch events.",
              frame.error?.code ?? "watchUnavailable",
            );
          }
          const event = frame as StreamDeckControlEvent;
          if (event.protocolVersion !== CONTROL_PROTOCOL_VERSION) {
            throw new SnipsyControlError(
              "Snipsy returned an unsupported event protocol version.",
              "unsupportedProtocol",
            );
          }
          if (typeof event.event !== "string") {
            throw new SnipsyControlError("Snipsy returned a malformed watch event.", "invalidEvent");
          }
          onEvent(event);
        } catch (error) {
          notifyError(error);
          socket.destroy();
          return;
        }
      }
      newline = buffer.indexOf("\n");
    }
  });
  socket.on("error", notifyError);
  socket.on("close", () => {
    if (!closed && !errorNotified) {
      notifyError(new SnipsyControlError("Snipsy project watch ended.", "watchClosed"));
    }
  });

  return {
    close: () => {
      closed = true;
      socket.destroy();
    },
  };
}

function isControlResponse(value: unknown): value is ControlResponse<unknown> {
  return !!value && typeof value === "object" && "ok" in value;
}

function sendLine(endpoint: string, line: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint);
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SnipsyControlError("Timed out waiting for Snipsy control response.", "timeout"));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(`${line}\n`, "utf8");
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
          code === "ENOENT" || code === "ECONNREFUSED" ? "descriptorUnavailable" : "transportError",
        ),
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
