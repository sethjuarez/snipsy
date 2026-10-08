import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyAction,
  KeyDownEvent,
  PropertyInspectorDidAppearEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";

import { SnipsyClient, SnipsyControlError, StreamDeckButton, StreamDeckControlEvent } from "./snipsy-client";

const ACTION_UUID = "com.snipsy.streamdeck.trigger-snippet";

interface SnipsyActionSettings extends JsonObject {
  projectPath?: string;
  snippetId?: string;
  snippetType?: "text" | "video" | "automation";
  title?: string;
  iconDataUrl?: string;
}

type InspectorMessage =
  | { type: "listButtons" }
  | { type: "saveBinding"; settings: SnipsyActionSettings };

const client = new SnipsyClient();
const visibleKeys = new Map<string, KeyAction<SnipsyActionSettings>>();
const visibleKeyProjectPaths = new Map<string, string>();
const projectWatchers = new Map<
  string,
  {
    close?: () => void;
    reconnectTimer?: ReturnType<typeof setTimeout>;
    starting?: boolean;
  }
>();

@action({ UUID: ACTION_UUID })
class TriggerSnippetAction extends SingletonAction<SnipsyActionSettings> {
  override async onWillAppear(ev: WillAppearEvent<SnipsyActionSettings>): Promise<void> {
    if (ev.action.isKey()) {
      visibleKeys.set(ev.action.id, ev.action);
      trackKeyProject(ev.action, ev.payload.settings.projectPath);
      await ensureProjectWatcher(ev.payload.settings.projectPath);
    }
    await refreshKey(ev.action, ev.payload.settings);
  }

  override async onWillDisappear(ev: WillDisappearEvent<SnipsyActionSettings>): Promise<void> {
    visibleKeys.delete(ev.action.id);
    visibleKeyProjectPaths.delete(ev.action.id);
    await closeUnusedProjectWatchers();
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SnipsyActionSettings>): Promise<void> {
    if (ev.action.isKey()) {
      trackKeyProject(ev.action, ev.payload.settings.projectPath);
      await ensureProjectWatcher(ev.payload.settings.projectPath);
      await closeUnusedProjectWatchers();
    }
    await refreshKey(ev.action, ev.payload.settings);
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<SnipsyActionSettings>,
  ): Promise<void> {
    await sendButtonsToInspector(ev.action);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, SnipsyActionSettings>): Promise<void> {
    const payload = asInspectorMessage(ev.payload);
    if (!payload) {
      return;
    }
    if (payload.type === "saveBinding") {
      await ev.action.setSettings(payload.settings);
      if (ev.action.isKey()) {
        trackKeyProject(ev.action, payload.settings.projectPath);
        await ensureProjectWatcher(payload.settings.projectPath);
        await closeUnusedProjectWatchers();
      }
      await refreshKey(ev.action, payload.settings);
      return;
    }
    await sendButtonsToInspector(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent<SnipsyActionSettings>): Promise<void> {
    const settings = await ev.action.getSettings();
    if (!settings.projectPath || !settings.snippetId || !settings.snippetType) {
      await ev.action.setTitle("Bind in\nSnipsy");
      await ev.action.showAlert();
      return;
    }

    try {
      const result = await client.triggerButton(settings.projectPath, settings.snippetId, settings.snippetType);
      streamDeck.logger.debug(`Snipsy Stream Deck trigger ${result.status}: ${result.snippetType}/${result.id}`);
      await ev.action.showOk();
    } catch (error) {
      await ev.action.setTitle(labelForError(error));
      await ev.action.showAlert();
    }
  }
}

async function refreshKey(
  actionInstance: {
    isKey(): boolean;
    setTitle?: KeyAction<SnipsyActionSettings>["setTitle"];
    setImage?: KeyAction<SnipsyActionSettings>["setImage"];
  },
  settings: SnipsyActionSettings,
): Promise<void> {
  if (!actionInstance.isKey() || !actionInstance.setTitle || !actionInstance.setImage) {
    return;
  }
  if (!settings.projectPath || !settings.snippetId || !settings.snippetType) {
    await actionInstance.setTitle("Bind in\nSnipsy");
    await actionInstance.setImage(settings.iconDataUrl);
    return;
  }

  try {
    await refreshKeyFromButtons(actionInstance, settings, await client.listButtons(settings.projectPath));
  } catch (error) {
    await actionInstance.setTitle(labelForError(error));
    await actionInstance.setImage(settings.iconDataUrl);
  }
}

async function refreshKeyFromButtons(
  actionInstance: {
    isKey(): boolean;
    setTitle?: KeyAction<SnipsyActionSettings>["setTitle"];
    setImage?: KeyAction<SnipsyActionSettings>["setImage"];
  },
  settings: SnipsyActionSettings,
  buttons: StreamDeckButton[],
): Promise<void> {
  if (!actionInstance.isKey() || !actionInstance.setTitle || !actionInstance.setImage) {
    return;
  }
  const button = buttons.find((candidate) => buttonMatchesSettings(candidate, settings));
  if (!button) {
    await actionInstance.setTitle("Stale\nBinding");
    await actionInstance.setImage(settings.iconDataUrl);
    return;
  }
  await actionInstance.setTitle(button.title);
  await actionInstance.setImage(button.iconDataUrl);
}

async function ensureProjectWatcher(projectPath?: string): Promise<void> {
  const normalizedProjectPath = projectPath?.trim();
  if (!normalizedProjectPath || projectWatchers.has(normalizedProjectPath)) {
    return;
  }
  projectWatchers.set(normalizedProjectPath, { starting: true });
  try {
    const watcher = await client.watchProject(
      normalizedProjectPath,
      (event) => {
        void handleProjectEvent(normalizedProjectPath, event);
      },
      (error) => {
        handleWatchError(normalizedProjectPath, error);
      },
    );
    if (!hasVisibleKeyForProject(normalizedProjectPath) || !projectWatchers.has(normalizedProjectPath)) {
      watcher.close();
      return;
    }
    projectWatchers.set(normalizedProjectPath, { close: watcher.close });
  } catch (error) {
    handleWatchError(normalizedProjectPath, error);
  }
}

function handleWatchError(projectPath: string, error: unknown): void {
  const entry = projectWatchers.get(projectPath);
  if (entry?.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
  }
  projectWatchers.delete(projectPath);
  if (isTerminalWatchError(error)) {
    streamDeck.logger.debug("Snipsy project watch is unavailable", error);
    return;
  }
  if (!hasVisibleKeyForProject(projectPath)) {
    streamDeck.logger.debug("Failed to start Snipsy project watch", error);
    return;
  }
  const reconnectTimer = setTimeout(() => {
    const retryEntry = projectWatchers.get(projectPath);
    if (retryEntry?.reconnectTimer === reconnectTimer) {
      projectWatchers.delete(projectPath);
    }
    if (hasVisibleKeyForProject(projectPath)) {
      void ensureProjectWatcher(projectPath);
    }
  }, 2000);
  projectWatchers.set(projectPath, { reconnectTimer });
  streamDeck.logger.debug("Snipsy project watch ended; retrying", error);
}

async function handleProjectEvent(projectPath: string, event: StreamDeckControlEvent): Promise<void> {
  if (event.error) {
    for (const action of visibleKeys.values()) {
      const settings = await action.getSettings();
      if (settings.projectPath?.trim() === projectPath) {
        await action.setTitle(labelForError(new SnipsyControlError(event.error.message, event.error.code)));
        await action.setImage(settings.iconDataUrl);
      }
    }
    return;
  }
  if (!isProjectButtonsEvent(event.event) || !isProjectButtonsPayload(event.payload)) {
    return;
  }
  client.clearListButtonsCache(projectPath);
  for (const action of visibleKeys.values()) {
    const settings = await action.getSettings();
    if (settings.projectPath?.trim() === projectPath) {
      await refreshKeyFromButtons(action, settings, event.payload.buttons);
    }
  }
}

async function closeUnusedProjectWatchers(): Promise<void> {
  for (const [projectPath, watcher] of projectWatchers) {
    if (!hasVisibleKeyForProject(projectPath)) {
      if (watcher.reconnectTimer) {
        clearTimeout(watcher.reconnectTimer);
      }
      watcher.close?.();
      projectWatchers.delete(projectPath);
    }
  }
}

function hasVisibleKeyForProject(projectPath: string): boolean {
  for (const visibleProjectPath of visibleKeyProjectPaths.values()) {
    if (visibleProjectPath === projectPath) {
      return true;
    }
  }
  return false;
}

function trackKeyProject(action: KeyAction<SnipsyActionSettings>, projectPath?: string): void {
  const normalizedProjectPath = projectPath?.trim();
  if (normalizedProjectPath) {
    visibleKeyProjectPaths.set(action.id, normalizedProjectPath);
    return;
  }
  visibleKeyProjectPaths.delete(action.id);
}

function isProjectButtonsEvent(eventName: string): boolean {
  return (
    eventName === "snipsy.project.snapshot" ||
    eventName === "snipsy.project.changed"
  );
}

function isProjectButtonsPayload(payload: unknown): payload is { buttons: StreamDeckButton[] } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const buttons = (payload as { buttons?: unknown }).buttons;
  return Array.isArray(buttons);
}

function isTerminalWatchError(error: unknown): boolean {
  return (
    error instanceof SnipsyControlError &&
    (error.code === "unknownCommand" ||
      error.code === "unsupportedProtocol" ||
      error.code === "unsupportedTransport" ||
      error.code === "invalidEvent")
  );
}

async function sendButtonsToInspector(
  actionInstance: { getSettings(): Promise<SnipsyActionSettings> },
): Promise<void> {
  const settings = await actionInstance.getSettings();

  try {
    const activeProject = await client.activeProjectButtons();
    await streamDeck.ui.sendToPropertyInspector({
      type: "buttons",
      buttons: activeProject.buttons,
      projectPath: activeProject.projectPath,
      selectedSnippetId: settings.snippetId,
    });
  } catch (error) {
    await streamDeck.ui.sendToPropertyInspector({
      type: "buttons",
      buttons: [],
      error: labelForError(error),
    });
  }
}

function labelForError(error: unknown): string {
  if (error instanceof SnipsyControlError) {
    if (error.code === "descriptorUnavailable") return "Open\nSnipsy";
    if (error.code === "transportUnavailable") return "Snipsy\nOffline";
    if (error.code === "missingBinding") return "Bind in\nSnipsy";
    if (error.code === "busy") return "Snipsy\nBusy";
    if (error.code === "unsupportedProtocol" || error.code === "unsupportedTransport") return "Update\nSnipsy";
    if (error.code === "projectUnavailable") return "Project?\nMissing";
    if (error.code === "snippetNotFound" || error.code === "unknownSnippetType") return "Stale\nBinding";
    return "Snipsy\nError";
  }
  return "Snipsy\nError";
}

function buttonMatchesSettings(button: StreamDeckButton, settings: SnipsyActionSettings): boolean {
  return button.id === settings.snippetId && button.snippetType === settings.snippetType;
}

function asInspectorMessage(payload: JsonValue): InspectorMessage | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const type = payload.type;
  if (type === "listButtons") {
    return { type };
  }
  if (type === "saveBinding" && payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings)) {
    const settings = payload.settings as SnipsyActionSettings;
    return { type, settings };
  }
  return undefined;
}

streamDeck.actions.registerAction(new TriggerSnippetAction());

streamDeck
  .connect()
  .then(() => streamDeck.logger.info("Snipsy Stream Deck plugin connected"))
  .catch((error: unknown) => streamDeck.logger.error("Failed to connect Snipsy Stream Deck plugin", error));

export type { StreamDeckButton, SnipsyActionSettings };
