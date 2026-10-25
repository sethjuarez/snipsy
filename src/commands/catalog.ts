import type { AppView } from "../components/Sidebar";
import { NAV_SECTIONS } from "../components/Sidebar";
import type { Script, TextSnippet, VideoSnippet } from "../types";
import { displayHotkey } from "../utils/hotkeys";

export type CommandGroup = "Navigation" | "Create" | "Demo" | "Project" | "Help" | "Text" | "Clips" | "Automations";

export interface AppCommand {
  id: string;
  title: string;
  group: CommandGroup;
  /** Tauri accelerator format, e.g. `CmdOrControl+K`. */
  shortcut?: string;
  detail?: string;
  keywords?: Array<string | undefined>;
  /** When set, the command is shown but cannot run; the text says why. */
  disabledReason?: string;
  run: () => void;
}

export interface ShortcutInfo {
  id: string;
  title: string;
  shortcut: string;
}

const NAV_ITEMS = NAV_SECTIONS.flatMap((navSection) => navSection.items);

export const NAV_SHORTCUTS = Object.fromEntries(
  NAV_ITEMS.map((item, index) => [item.id, `CmdOrControl+${index + 1}`]),
) as Record<AppView, string>;

/** App-wide shortcuts that are handled outside the command list. */
export const STATIC_SHORTCUTS: ShortcutInfo[] = [
  { id: "palette", title: "Open command palette", shortcut: "CmdOrControl+K" },
  { id: "shortcuts", title: "Show keyboard shortcuts", shortcut: "CmdOrControl+/" },
  { id: "save", title: "Save the open editor", shortcut: "CmdOrControl+S" },
  { id: "escape", title: "Close a dialog or menu", shortcut: "Escape" },
];

/** Every in-app shortcut, used by the help dialog and conflict checks. */
export const ALL_SHORTCUTS: ShortcutInfo[] = [
  ...STATIC_SHORTCUTS,
  ...NAV_ITEMS.map((item) => ({ id: `nav.${item.id}`, title: `Go to ${item.label}`, shortcut: NAV_SHORTCUTS[item.id] })),
];

export interface CommandContext {
  demoMode: boolean;
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  automations: Script[];
  runningAutomationId?: string | null;
  navigate: (view: AppView) => void;
  newTextSnippet: () => void;
  newClip: () => void;
  newAutomation: () => void;
  toggleDemo: () => void;
  closeProject: () => void;
  showShortcuts: () => void;
  toggleSidebar: () => void;
  editText: (snippet: TextSnippet) => void;
  editClip: (snippet: VideoSnippet) => void;
  playClip: (snippet: VideoSnippet) => void;
  editAutomation: (script: Script) => void;
  runAutomation: (script: Script) => void;
}

export function buildCommands(ctx: CommandContext): AppCommand[] {
  const navigation: AppCommand[] = NAV_ITEMS.map((item) => ({
    id: `nav.${item.id}`,
    title: `Go to ${item.label}`,
    group: "Navigation",
    shortcut: NAV_SHORTCUTS[item.id],
    keywords: sectionKeywords(item.id),
    run: () => ctx.navigate(item.id),
  }));

  const automationBusy = ctx.runningAutomationId ? "Another automation is running" : undefined;
  return [
    ...navigation,
    { id: "create.text", title: "New text snippet", group: "Create", keywords: ["add", "snippet"], run: ctx.newTextSnippet },
    { id: "create.clip", title: "New clip", group: "Create", keywords: ["add", "video"], run: ctx.newClip },
    { id: "create.automation", title: "New automation", group: "Create", keywords: ["add", "script"], run: ctx.newAutomation },
    {
      id: "demo.toggle",
      title: ctx.demoMode ? "Stop demo" : "Start demo",
      group: "Demo",
      keywords: ["demo mode", "present", "live", "hotkeys"],
      run: ctx.toggleDemo,
    },
    { id: "project.close", title: "Close project", group: "Project", keywords: ["home", "welcome"], run: ctx.closeProject },
    { id: "view.sidebar", title: "Toggle sidebar", group: "Project", keywords: ["collapse", "expand"], run: ctx.toggleSidebar },
    { id: "help.shortcuts", title: "Keyboard shortcuts", group: "Help", shortcut: "CmdOrControl+/", keywords: ["keys", "help"], run: ctx.showShortcuts },
    ...ctx.textSnippets.map<AppCommand>((snippet) => ({
      id: `text.edit.${snippet.id}`,
      title: `Edit ${snippet.title || "Untitled snippet"}`,
      group: "Text",
      detail: snippet.hotkey ? displayHotkey(snippet.hotkey) : "No hotkey",
      keywords: [snippet.description],
      run: () => ctx.editText(snippet),
    })),
    ...ctx.videoSnippets.flatMap<AppCommand>((snippet) => [
      {
        id: `clip.play.${snippet.id}`,
        title: `Play ${snippet.title || "Untitled clip"}`,
        group: "Clips",
        detail: snippet.hotkey ? displayHotkey(snippet.hotkey) : "No hotkey",
        keywords: [snippet.description, "preview"],
        run: () => ctx.playClip(snippet),
      },
      {
        id: `clip.edit.${snippet.id}`,
        title: `Edit ${snippet.title || "Untitled clip"}`,
        group: "Clips",
        detail: snippet.videoFile,
        keywords: [snippet.description],
        run: () => ctx.editClip(snippet),
      },
    ]),
    ...ctx.automations.flatMap<AppCommand>((script) => [
      {
        id: `automation.run.${script.id}`,
        title: `Run ${script.title || "Untitled automation"}`,
        group: "Automations",
        detail: script.hotkey ? displayHotkey(script.hotkey) : undefined,
        keywords: [script.description],
        disabledReason: automationBusy,
        run: () => ctx.runAutomation(script),
      },
      {
        id: `automation.edit.${script.id}`,
        title: `Edit ${script.title || "Untitled automation"}`,
        group: "Automations",
        keywords: [script.description],
        run: () => ctx.editAutomation(script),
      },
    ]),
  ];
}

function sectionKeywords(view: AppView): string[] {
  const match = NAV_SECTIONS.find((navSection) => navSection.items.some((item) => item.id === view));
  return match?.label ? [match.label] : [];
}

type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/** True when a keydown matches a shortcut in Tauri accelerator format. */
export function matchesShortcut(event: ShortcutEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop()?.toLowerCase();
  if (!key) return false;
  const wantsMod = parts.some((part) => /^(CmdOrControl|CommandOrControl|Ctrl|Control|Cmd|Command|Meta|Super)$/i.test(part));
  const wantsShift = parts.some((part) => /^shift$/i.test(part));
  const wantsAlt = parts.some((part) => /^(alt|option)$/i.test(part));
  const hasMod = event.ctrlKey || event.metaKey;
  return hasMod === wantsMod && event.shiftKey === wantsShift && event.altKey === wantsAlt && event.key.toLowerCase() === key;
}
