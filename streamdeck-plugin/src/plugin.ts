import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyAction,
  KeyDownEvent,
  PropertyInspectorDidAppearEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";

import { SnipsyClient, SnipsyControlError, StreamDeckButton } from "./snipsy-client";

const ACTION_UUID = "com.snipsy.streamdeck.trigger-snippet";

interface SnipsyActionSettings extends JsonObject {
  projectPath?: string;
  snippetId?: string;
  snippetType?: "text" | "video";
  title?: string;
  iconDataUrl?: string;
}

type InspectorMessage =
  | { type: "listButtons"; projectPath?: string }
  | { type: "saveBinding"; settings: SnipsyActionSettings };

const client = new SnipsyClient();

@action({ UUID: ACTION_UUID })
class TriggerSnippetAction extends SingletonAction<SnipsyActionSettings> {
  override async onWillAppear(ev: WillAppearEvent<SnipsyActionSettings>): Promise<void> {
    await refreshKey(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SnipsyActionSettings>): Promise<void> {
    await refreshKey(ev.action, ev.payload.settings);
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<SnipsyActionSettings>,
  ): Promise<void> {
    const settings = await ev.action.getSettings();
    await sendButtonsToInspector(ev.action, settings.projectPath);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, SnipsyActionSettings>): Promise<void> {
    const payload = asInspectorMessage(ev.payload);
    if (!payload) {
      return;
    }
    if (payload.type === "saveBinding") {
      await ev.action.setSettings(payload.settings);
      await refreshKey(ev.action, payload.settings);
      return;
    }
    await sendButtonsToInspector(ev.action, payload.projectPath);
  }

  override async onKeyDown(ev: KeyDownEvent<SnipsyActionSettings>): Promise<void> {
    const settings = await ev.action.getSettings();
    if (!settings.projectPath || !settings.snippetId || !settings.snippetType) {
      await ev.action.setTitle("Bind in\nSnipsy");
      await ev.action.showAlert();
      return;
    }

    try {
      await client.triggerButton(settings.projectPath, settings.snippetId, settings.snippetType);
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
    const buttons = await client.listButtons(settings.projectPath);
    const button = buttons.find((candidate) => buttonMatchesSettings(candidate, settings));
    if (!button) {
      await actionInstance.setTitle("Stale\nBinding");
      await actionInstance.setImage(settings.iconDataUrl);
      return;
    }
    await actionInstance.setTitle(button.title);
    await actionInstance.setImage(button.iconDataUrl);
  } catch (error) {
    await actionInstance.setTitle(labelForError(error));
    await actionInstance.setImage(settings.iconDataUrl);
  }
}

async function sendButtonsToInspector(
  actionInstance: { getSettings(): Promise<SnipsyActionSettings> },
  projectPath?: string,
): Promise<void> {
  const settings = await actionInstance.getSettings();
  const effectiveProjectPath = projectPath ?? settings.projectPath;
  if (!effectiveProjectPath) {
    await streamDeck.ui.sendToPropertyInspector({
      type: "buttons",
      buttons: [],
      error: "Enter a Snipsy project path, then refresh.",
    });
    return;
  }

  try {
    const buttons = await client.listButtons(effectiveProjectPath);
    await streamDeck.ui.sendToPropertyInspector({
      type: "buttons",
      buttons,
      projectPath: effectiveProjectPath,
    });
  } catch (error) {
    await streamDeck.ui.sendToPropertyInspector({
      type: "buttons",
      buttons: [],
      error: labelForError(error),
      projectPath: effectiveProjectPath,
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
    if (error.code === "commandFailed" && /not found|missing/i.test(error.message)) return "Project?\nSnippet?";
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
    return {
      type,
      projectPath: typeof payload.projectPath === "string" ? payload.projectPath : undefined,
    };
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
