import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useProjectStore } from "./stores/projectStore";
import { useUpdateStore } from "./stores/updateStore";
import { Plus, X as XIcon, Save, Upload } from "lucide-react";
import Welcome from "./components/Welcome";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StreamDeckPreview from "./components/StreamDeckPreview";
import HotkeysTable from "./components/HotkeysTable";
import StatusBar from "./components/StatusBar";
import TrayHint from "./components/TrayHint";
import TextSnippetList from "./components/TextSnippetList";
import TextSnippetForm from "./components/TextSnippetForm";
import VideoList, { type VideoListHandle, type VideoListToolbarState } from "./components/VideoList";
import ClipEditor, { type ClipEditorHandle, type ClipEditorSaveState } from "./components/ClipEditor";
import VideoSnippetList from "./components/VideoSnippetList";
import ClipsTabs from "./components/ClipsTabs";
import HotkeyOverview from "./components/HotkeyOverview";
import VideoSnippetForm from "./components/VideoSnippetForm";
import ScriptList, { type AutomationRunHistoryItem } from "./components/ScriptList";
import ScriptForm from "./components/ScriptForm";
import ConfirmDialog from "./components/ConfirmDialog";
import SectionToolbar, { type ToolbarAction } from "./components/SectionToolbar";
import ToastViewport, { type ToastMessage, type ToastTone } from "./components/ToastViewport";
import ErrorBoundary from "./components/ErrorBoundary";
import CommandPalette from "./components/CommandPalette";
import ShortcutsDialog from "./components/ShortcutsDialog";
import SettingsDialog from "./components/SettingsDialog";
import type { SettingsSectionId } from "./utils/settings";
import { DemoPreflightPanel, DemoStartDialog } from "./components/DemoPreflight";
import { computePreflight, liveArmedCount, shouldConfirmDemoStart } from "./utils/preflight";
import { buildCommands, matchesShortcut, NAV_SHORTCUTS, type CommandContext } from "./commands/catalog";
import { getBackend } from "./services";
import { auditaurListen } from "./services/auditaur";
import { collectHotkeyOwners, describeHotkeyIssues, type HotkeyOwner } from "./utils/hotkeys";
import { duplicateAutomation, duplicateTextSnippet, duplicateVideoSnippet } from "./utils/duplicate";
import { upsertToast } from "./utils/toasts";
import type { TextSnippet, VideoSnippet, Script, ImportedVideo } from "./types";
import type { AppView } from "./components/Sidebar";

const DEMO_HOTKEY_TOAST_ID = "demo-hotkey-issues";
const DEMO_HOTKEY_SYNC_TOAST_ID = "demo-hotkey-sync";

const backend = getBackend();

const DEFAULT_SAVE_STATE: ClipEditorSaveState = {
  canSave: false,
  readinessText: "Needs required fields",
  saveStatus: "idle",
  hasUnsavedChanges: false,
};
type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  testId?: string;
  onConfirm: () => void;
};

function App() {
  const projectName = useProjectStore((s) => s.projectName);
  const projectPath = useProjectStore((s) => s.projectPath);
  const textSnippets = useProjectStore((s) => s.textSnippets);
  const setTextSnippets = useProjectStore((s) => s.setTextSnippets);
  const videoSnippets = useProjectStore((s) => s.videoSnippets);
  const setVideoSnippets = useProjectStore((s) => s.setVideoSnippets);
  const automations = useProjectStore((s) => s.automations);
  const saveAutomation = useProjectStore((s) => s.saveAutomation);
  const deleteAutomationFromStore = useProjectStore((s) => s.deleteAutomation);
  const demoMode = useProjectStore((s) => s.demoMode);
  const enterDemoMode = useProjectStore((s) => s.enterDemoMode);
  const exitDemoMode = useProjectStore((s) => s.exitDemoMode);
  const playVideo = useProjectStore((s) => s.playVideo);
  const closeProject = useProjectStore((s) => s.closeProject);
  const autoOpenLastProject = useProjectStore((s) => s.autoOpenLastProject);

  const [activeView, setActiveView] = useState<AppView>("home");
  const [showForm, setShowForm] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<TextSnippet | undefined>(undefined);
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [editingVideoSnippet, setEditingVideoSnippet] = useState<VideoSnippet | undefined>(undefined);
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | undefined>(undefined);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [clipEditingVideo, setClipEditingVideo] = useState<ImportedVideo | null>(null);
  const [runningScriptId, setRunningScriptId] = useState<string | null>(null);
  const [automationRunHistory, setAutomationRunHistory] = useState<AutomationRunHistoryItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const clipEditorRef = useRef<ClipEditorHandle>(null);
  const [clipSaveState, setClipSaveState] = useState<ClipEditorSaveState>(DEFAULT_SAVE_STATE);
  const [textSnippetSaveState, setTextSnippetSaveState] = useState<ClipEditorSaveState>(DEFAULT_SAVE_STATE);
  const [videoSnippetSaveState, setVideoSnippetSaveState] = useState<ClipEditorSaveState>(DEFAULT_SAVE_STATE);
  const [scriptSaveState, setScriptSaveState] = useState<ClipEditorSaveState>(DEFAULT_SAVE_STATE);
  const videoListRef = useRef<VideoListHandle>(null);
  const [videoListToolbarState, setVideoListToolbarState] = useState<VideoListToolbarState>({ importing: false });
  const hotkeyOwners = collectHotkeyOwners(textSnippets, videoSnippets, automations);

  const showToast = useCallback((title: string, detail?: string, tone: ToastTone = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => upsertToast(current, { id, title, detail, tone }));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  // Demo mode hides the window, so hotkey problems stay until dismissed and
  // update in place as snippets are edited.
  const demoHotkeyIssues = useProjectStore((s) => s.demoHotkeyIssues);
  const lastHotkeyIssuesRef = useRef("[]");
  useEffect(() => {
    const signature = JSON.stringify(demoHotkeyIssues);
    if (signature === lastHotkeyIssuesRef.current) return;
    lastHotkeyIssuesRef.current = signature;
    if (demoHotkeyIssues.length === 0) {
      setToasts((current) => current.filter((toast) => toast.id !== DEMO_HOTKEY_TOAST_ID));
      return;
    }
    const { textSnippets: text, videoSnippets: video, automations: scripts } = useProjectStore.getState();
    setToasts((current) =>
      upsertToast(current, {
        id: DEMO_HOTKEY_TOAST_ID,
        title: demoHotkeyIssues.length === 1 ? "1 hotkey is not active" : `${demoHotkeyIssues.length} hotkeys are not active`,
        detail: describeHotkeyIssues(demoHotkeyIssues, collectHotkeyOwners(text, video, scripts)),
        tone: "warning",
        sticky: true,
      }),
    );
  }, [demoHotkeyIssues]);

  const demoHotkeySyncError = useProjectStore((s) => s.demoHotkeySyncError);
  useEffect(() => {
    if (!demoHotkeySyncError) {
      setToasts((current) => current.filter((toast) => toast.id !== DEMO_HOTKEY_SYNC_TOAST_ID));
      return;
    }
    setToasts((current) =>
      upsertToast(current, {
        id: DEMO_HOTKEY_SYNC_TOAST_ID,
        title: "Saved, but live demo hotkeys weren't updated",
        detail: `${demoHotkeySyncError}. Stop and restart the demo to apply changes.`,
        tone: "error",
        sticky: true,
      }),
    );
  }, [demoHotkeySyncError]);

  // Source video list, used to flag clips whose video was removed. Tagged with
  // the project and refreshed on every view change so imports show up.
  const [videoAvailability, setVideoAvailability] = useState<{ projectPath: string; files: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    backend.getImportedVideos(projectPath)
      .then((videos) => {
        if (!cancelled) setVideoAvailability({ projectPath, files: new Set(videos.map((video) => video.relativePath)) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectPath, activeView]);
  const availableVideoFiles = videoAvailability?.projectPath === projectPath ? videoAvailability.files : null;
  const handleVideosChange = useCallback((relativePaths: string[]) => {
    if (projectPath) setVideoAvailability({ projectPath, files: new Set(relativePaths) });
  }, [projectPath]);

  // Auto-open last project on startup
  useEffect(() => {
    // A webview reload resets demoMode to false while the backend may still
    // hold hotkeys; reset the backend so the two sides agree.
    void useProjectStore.getState().reconcileDemoMode();
    void autoOpenLastProject();
    // Silent update check on startup
    useUpdateStore.getState().checkForUpdate();
  }, [autoOpenLastProject]);

  // Listen for tray "Exit Demo Mode" event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    auditaurListen("exit-demo-mode", () => { exitDemoMode(); })
      .then((fn) => { unlisten = fn; })
      .catch((error: unknown) => {
        console.warn("Failed to register exit-demo-mode listener", error);
      });
    return () => unlisten?.();
  }, [exitDemoMode]);

  const reportDuplicate = (saving: Promise<void>, title: string, noun: string) => {
    saving
      .then(() => showToast(`Duplicated "${title}"`, "The copy has no hotkey yet. Assign one before your demo.", "success"))
      .catch((error: unknown) => showToast(`Could not duplicate ${noun}`, String(error), "error"));
  };

  // -- Text snippet handlers --
  const handleEdit = (snippet: TextSnippet) => {
    setEditingSnippet(snippet);
    setShowForm(true);
  };
  const handleDelete = (id: string) => {
    setConfirmDialog({
      title: "Delete Snippet?",
      message: "This will permanently delete this text snippet. This action cannot be undone.",
      onConfirm: () => {
        setTextSnippets(textSnippets.filter((s) => s.id !== id));
        setConfirmDialog(null);
      },
    });
  };
  const handleSave = (snippet: TextSnippet) => {
    const idx = textSnippets.findIndex((s) => s.id === snippet.id);
    if (idx >= 0) {
      const updated = [...textSnippets];
      updated[idx] = snippet;
      setTextSnippets(updated);
    } else {
      setTextSnippets([...textSnippets, snippet]);
    }
    setEditingSnippet(snippet);
  };
  const handleCancel = () => {
    setShowForm(false);
    setEditingSnippet(undefined);
  };

  const handleDuplicate = (snippet: TextSnippet) => {
    const copy = duplicateTextSnippet(snippet);
    const idx = textSnippets.findIndex((s) => s.id === snippet.id);
    const updated = [...textSnippets];
    updated.splice(idx + 1, 0, copy);
    reportDuplicate(setTextSnippets(updated), snippet.title, "snippet");
  };

  // -- Video snippet handlers --
  const handleVideoEdit = async (snippet: VideoSnippet) => {
    // Open the visual clip editor for this snippet
    if (projectPath) {
      const videos = await backend.getImportedVideos(projectPath);
      const match = videos.find((v) => v.relativePath === snippet.videoFile);
      if (match) {
        setEditingVideoSnippet(snippet);
        setClipEditingVideo(match);
        return;
      }
    }
    // Fallback to form if video not found
    setEditingVideoSnippet(snippet);
    setShowVideoForm(true);
  };
  const handleVideoDelete = (id: string) => {
    setConfirmDialog({
      title: "Delete Video Clip?",
      message: "This will permanently delete this video clip. This action cannot be undone.",
      onConfirm: () => {
        setVideoSnippets(videoSnippets.filter((s) => s.id !== id));
        setConfirmDialog(null);
      },
    });
  };
  const handleVideoSave = (snippet: VideoSnippet) => {
    const idx = videoSnippets.findIndex((s) => s.id === snippet.id);
    if (idx >= 0) {
      const updated = [...videoSnippets];
      updated[idx] = snippet;
      setVideoSnippets(updated);
    } else {
      setVideoSnippets([...videoSnippets, snippet]);
    }
    setEditingVideoSnippet(snippet);
  };
  const handleVideoCancel = () => {
    setShowVideoForm(false);
    setEditingVideoSnippet(undefined);
  };

  const handleVideoDuplicate = (snippet: VideoSnippet) => {
    const copy = duplicateVideoSnippet(snippet);
    const idx = videoSnippets.findIndex((s) => s.id === snippet.id);
    const updated = [...videoSnippets];
    updated.splice(idx + 1, 0, copy);
    reportDuplicate(setVideoSnippets(updated), snippet.title, "clip");
  };

  // -- Script handlers --
  const handleScriptEdit = (script: Script) => {
    setEditingScript(script);
    setShowScriptForm(true);
  };
  const handleScriptDelete = (id: string) => {
    setConfirmDialog({
      title: "Delete Automation?",
      message: "This will permanently delete this automation. This action cannot be undone.",
      onConfirm: () => {
        deleteAutomationFromStore(id);
        setConfirmDialog(null);
      },
    });
  };
  const handleScriptSave = (script: Script) => {
    saveAutomation(script);
    setShowScriptForm(false);
    setEditingScript(undefined);
  };
  const handleScriptDuplicate = (script: Script) => {
    reportDuplicate(saveAutomation(duplicateAutomation(script)), script.title, "automation");
  };
  const handleScriptCancel = () => {
    setShowScriptForm(false);
    setEditingScript(undefined);
  };

  const closeActiveEditor = useCallback(() => {
    handleCancel();
    handleVideoCancel();
    handleScriptCancel();
    setClipEditingVideo(null);
    setEditingVideoSnippet(undefined);
    setClipSaveState(DEFAULT_SAVE_STATE);
    setTextSnippetSaveState(DEFAULT_SAVE_STATE);
    setVideoSnippetSaveState(DEFAULT_SAVE_STATE);
    setScriptSaveState(DEFAULT_SAVE_STATE);
  }, []);

  const guardEditorExit = useCallback((next: () => void) => {
    const activeSaveState = clipEditingVideo
      ? clipSaveState
      : showForm
        ? textSnippetSaveState
        : showVideoForm
          ? videoSnippetSaveState
          : showScriptForm
            ? scriptSaveState
            : null;

    if (!activeSaveState?.hasUnsavedChanges) {
      closeActiveEditor();
      next();
      return;
    }

    setConfirmDialog({
      title: "Discard changes?",
      message: "You have changes in this editor that have not been saved. Close anyway and discard them?",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      danger: true,
      testId: "discard-changes-dialog",
      onConfirm: () => {
        closeActiveEditor();
        setConfirmDialog(null);
        next();
      },
    });
  }, [
    clipEditingVideo,
    clipSaveState,
    closeActiveEditor,
    scriptSaveState,
    showForm,
    showScriptForm,
    showVideoForm,
    textSnippetSaveState,
    videoSnippetSaveState,
  ]);
  const requestCloseActiveEditor = useCallback(() => guardEditorExit(() => {}), [guardEditorExit]);

  // Leaving the clip editor asks before discarding unsaved edits; list forms stay open per view.
  const changeView = (view: AppView) => {
    if (clipEditingVideo) guardEditorExit(() => setActiveView(view));
    else setActiveView(view);
  };

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | null>(null);
  const [demoStartOpen, setDemoStartOpen] = useState(false);
  const [elevated, setElevated] = useState<boolean | null>(null);
  useEffect(() => {
    backend.isElevated().then(setElevated).catch(() => setElevated(null));
  }, []);
  const preflight = useMemo(
    () => computePreflight({ textSnippets, videoSnippets, automations, availableVideoFiles, elevated }),
    [textSnippets, videoSnippets, automations, availableVideoFiles, elevated],
  );
  const blockingOverlay = confirmDialog !== null || demoStartOpen;
  const overlayOpen = paletteOpen || shortcutsOpen || settingsSection !== null || blockingOverlay;
  const openSettings = (section: SettingsSectionId = "appearance") => {
    if (blockingOverlay) return;
    setPaletteOpen(false);
    setShortcutsOpen(false);
    setSettingsSection(section);
  };

  const commandContext: CommandContext = {
    demoMode,
    textSnippets,
    videoSnippets,
    automations,
    runningAutomationId: runningScriptId,
    navigate: changeView,
    newTextSnippet: () => guardEditorExit(() => {
      setActiveView("text-snippets");
      setEditingSnippet(undefined);
      setShowForm(true);
    }),
    newClip: () => guardEditorExit(() => {
      setActiveView("video-snippets");
      setEditingVideoSnippet(undefined);
      setShowVideoForm(true);
    }),
    newAutomation: () => guardEditorExit(() => {
      setActiveView("automations");
      setEditingScript(undefined);
      setShowScriptForm(true);
    }),
    toggleDemo: () => handleToggleDemo(),
    closeProject: () => guardEditorExit(() => void closeProject()),
    showShortcuts: () => setShortcutsOpen(true),
    openSettings: () => openSettings(),
    toggleSidebar: () => setSidebarCollapsed((collapsed) => !collapsed),
    editText: (snippet) => guardEditorExit(() => {
      setActiveView("text-snippets");
      handleEdit(snippet);
    }),
    editClip: (snippet) => guardEditorExit(() => {
      setActiveView("video-snippets");
      void handleVideoEdit(snippet);
    }),
    playClip: (snippet) => void playVideo(snippet),
    editAutomation: (script) => guardEditorExit(() => {
      setActiveView("automations");
      handleScriptEdit(script);
    }),
    runAutomation: (script) => void handleRunScript(script.id),
  };

  const changeOwnerHotkey = async (owner: HotkeyOwner, hotkey: string) => {
    if (owner.kind === "text") {
      await setTextSnippets(textSnippets.map((snippet) => (snippet.id === owner.id ? { ...snippet, hotkey } : snippet)));
    } else if (owner.kind === "video") {
      await setVideoSnippets(videoSnippets.map((snippet) => (snippet.id === owner.id ? { ...snippet, hotkey } : snippet)));
    } else {
      const script = automations.find((candidate) => candidate.id === owner.id);
      if (script) await saveAutomation({ ...script, hotkey: hotkey || undefined });
    }
  };
  const openHotkeyOwner = (owner: HotkeyOwner) => {
    if (owner.kind === "text") {
      const snippet = textSnippets.find((candidate) => candidate.id === owner.id);
      if (snippet) commandContext.editText(snippet);
    } else if (owner.kind === "video") {
      const snippet = videoSnippets.find((candidate) => candidate.id === owner.id);
      if (snippet) commandContext.editClip(snippet);
    } else {
      const script = automations.find((candidate) => candidate.id === owner.id);
      if (script) commandContext.editAutomation(script);
    }
  };

  const shortcutHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutHandlerRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) return;
    if (matchesShortcut(event, "CmdOrControl+,")) {
      event.preventDefault();
      if (settingsSection !== null) setSettingsSection(null);
      else openSettings();
      return;
    }
    if (!projectName) return;
    if (matchesShortcut(event, "CmdOrControl+K")) {
      event.preventDefault();
      if (blockingOverlay) return;
      setShortcutsOpen(false);
      setSettingsSection(null);
      setPaletteOpen((open) => !open);
      return;
    }
    if (matchesShortcut(event, "CmdOrControl+/")) {
      event.preventDefault();
      if (blockingOverlay) return;
      setPaletteOpen(false);
      setSettingsSection(null);
      setShortcutsOpen((open) => !open);
      return;
    }
    if (overlayOpen) return;
    const view = (Object.keys(NAV_SHORTCUTS) as AppView[]).find((candidate) => matchesShortcut(event, NAV_SHORTCUTS[candidate] ?? ""));
    if (view) {
      event.preventDefault();
      changeView(view);
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => shortcutHandlerRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleRunScript = useCallback(async (scriptId: string) => {
    if (!projectPath) return;
    const scriptTitle = automations.find((script) => script.id === scriptId)?.title ?? "Automation";
    setRunningScriptId(scriptId);
    try {
      const message = await backend.runAutomation(projectPath, scriptId);
      showToast("Automation completed", message, "success");
      const historyItem: AutomationRunHistoryItem = {
        scriptId,
        title: scriptTitle,
        status: "success",
        message,
        completedAt: new Date().toISOString(),
      };
      setAutomationRunHistory((items) => [
        historyItem,
        ...items,
      ].slice(0, 10));
    } catch (e) {
      showToast("Automation failed", String(e), "error");
      const historyItem: AutomationRunHistoryItem = {
        scriptId,
        title: scriptTitle,
        status: "error",
        message: String(e),
        completedAt: new Date().toISOString(),
      };
      setAutomationRunHistory((items) => [
        historyItem,
        ...items,
      ].slice(0, 10));
    } finally {
      setRunningScriptId(null);
    }
  }, [projectPath, automations, showToast]);

  const handleToggleDemo = () => {
    if (demoMode) void exitDemoMode();
    else if (shouldConfirmDemoStart(preflight)) {
      setPaletteOpen(false);
      setShortcutsOpen(false);
      setSettingsSection(null);
      setDemoStartOpen(true);
    } else void enterDemoMode();
  };

  const settingsDialog = settingsSection !== null && (
    <SettingsDialog
      initialSection={settingsSection}
      elevated={elevated}
      onClose={() => setSettingsSection(null)}
      onRelaunchAsAdmin={() => void backend.relaunchAsAdmin().catch((e) => showToast("Couldn't restart as administrator", String(e), "error"))}
      onShowShortcuts={projectName ? () => {
        setSettingsSection(null);
        setShortcutsOpen(true);
      } : undefined}
      onNavigate={projectName ? (view) => {
        setSettingsSection(null);
        changeView(view);
      } : undefined}
    />
  );

  // ── Welcome screen (no project loaded) ──
  if (!projectName) {
    return (
      <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
        <TitleBar projectName={null} demoMode={false} onToggleDemo={() => {}} onOpenSettings={openSettings} />
        <div className="flex-1 flex items-center justify-center">
          <Welcome />
        </div>
        <TrayHint />
        <StatusBar projectPath={null} demoMode={false} />
        {settingsDialog}
      </div>
    );
  }

  // ── Main app layout ──
  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <TitleBar projectName={projectName} demoMode={demoMode} onToggleDemo={handleToggleDemo} onOpenPalette={() => { if (!blockingOverlay) { setShortcutsOpen(false); setSettingsSection(null); setPaletteOpen(true); } }} onOpenSettings={openSettings} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onViewChange={changeView} onCloseProject={() => guardEditorExit(() => void closeProject())} />

        {/* Content area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ErrorBoundary>
          {/* Content header */}
          <ContentHeader
            view={activeView}
            editLabel={
              clipEditingVideo
                ? (editingVideoSnippet ? `Edit Clip — ${clipEditingVideo.name}` : `New Clip — ${clipEditingVideo.name}`)
                : undefined
            }
            showForm={
              (activeView === "text-snippets" && showForm) ||
              (activeView === "video-snippets" && showVideoForm) ||
              clipEditingVideo !== null ||
              (activeView === "automations" && showScriptForm)
            }
            onAdd={() => {
              if (activeView === "text-snippets") {
                setEditingSnippet(undefined);
                setShowForm(true);
              } else if (activeView === "video-snippets") {
                setEditingVideoSnippet(undefined);
                setShowVideoForm(true);
              } else if (activeView === "automations") {
                setEditingScript(undefined);
                setShowScriptForm(true);
              }
            }}
            onCloseForm={requestCloseActiveEditor}
            saveAction={clipEditingVideo
              ? {
                label: "Save Clip",
                state: clipSaveState,
                onClick: () => clipEditorRef.current?.save(),
                testId: "clip-save",
                cancelTestId: "clip-cancel",
              }
              : showForm
                ? {
                  label: editingSnippet ? "Update" : "Create",
                  state: textSnippetSaveState,
                  form: "text-snippet-editor-form",
                  testId: "snippet-save",
                  cancelTestId: "snippet-cancel",
                }
                : showVideoForm
                  ? {
                    label: editingVideoSnippet ? "Update" : "Create",
                    state: videoSnippetSaveState,
                    form: "video-snippet-editor-form",
                    testId: "video-snippet-save",
                    cancelTestId: "video-snippet-cancel",
                  }
                  : showScriptForm
                    ? {
                      label: editingScript ? "Update" : "Create",
                      state: scriptSaveState,
                      form: "automation-editor-form",
                      testId: "automation-save",
                      cancelTestId: "automation-cancel",
                    }
                    : undefined}
            videoImporting={videoListToolbarState.importing}
            onImportVideo={() => videoListRef.current?.importVideo()}
          />

          {/* Scrollable content — use overflow-hidden when clip editor is active */}
          <div className={`flex-1 p-4 ${clipEditingVideo ? "overflow-hidden" : "overflow-y-auto"}`}>
            {clipEditingVideo && projectPath ? (
              <div className="h-full rounded-lg p-4" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                <ClipEditor
                  ref={clipEditorRef}
                  video={clipEditingVideo}
                  existingClip={editingVideoSnippet}
                  hotkeyOwners={hotkeyOwners}
                  onSaveStateChange={setClipSaveState}
                  onSave={(clip) => {
                    if (editingVideoSnippet) {
                      // Update existing snippet
                      const idx = videoSnippets.findIndex((s) => s.id === editingVideoSnippet.id);
                      if (idx >= 0) {
                        const updatedSnippet = { id: editingVideoSnippet.id, ...clip };
                        const updated = [...videoSnippets];
                        updated[idx] = updatedSnippet;
                        setVideoSnippets(updated);
                        setEditingVideoSnippet(updatedSnippet);
                      }
                    } else {
                      // Create new snippet
                      const newSnippet: VideoSnippet = {
                        id: crypto.randomUUID(),
                        ...clip,
                      };
                      setVideoSnippets([...videoSnippets, newSnippet]);
                      setEditingVideoSnippet(newSnippet);
                    }
                  }}
                />
              </div>
            ) : (
            <>
            {activeView === "home" && (
              <div className="space-y-4">
                <DemoPreflightPanel preflight={preflight} demoMode={demoMode} projectName={projectName} liveArmedCount={liveArmedCount(preflight, demoHotkeyIssues)} onToggleDemo={handleToggleDemo} />
                <HotkeyOverview
                  textSnippets={textSnippets}
                  videoSnippets={videoSnippets}
                  onPlayVideo={playVideo}
                  onEditText={(snippet) => {
                    setActiveView("text-snippets");
                    handleEdit(snippet);
                  }}
                  onEditVideo={(snippet) => {
                    setActiveView("video-snippets");
                    handleVideoEdit(snippet);
                  }}
                  onDeleteText={handleDelete}
                  onDeleteVideo={handleVideoDelete}
                />
              </div>
            )}

            {activeView === "text-snippets" && (
              showForm ? (
                <div className="rounded-lg p-5" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                  <TextSnippetForm
                    snippet={editingSnippet}
                    onSave={handleSave}
                    hotkeyOwners={hotkeyOwners}
                    onSaveStateChange={setTextSnippetSaveState}
                  />
                </div>
              ) : (
                <TextSnippetList
                  snippets={textSnippets}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onReorder={setTextSnippets}
                  onDuplicate={handleDuplicate}
                  onAdd={() => {
                    setEditingSnippet(undefined);
                    setShowForm(true);
                  }}
                  hotkeyOwners={hotkeyOwners}
                />
              )
            )}

            {(activeView === "videos" || (activeView === "video-snippets" && !showVideoForm)) && (
              <ClipsTabs
                active={activeView}
                clipCount={videoSnippets.length}
                videoCount={availableVideoFiles?.size}
                onChange={changeView}
              />
            )}
            {activeView === "videos" && projectPath && (
              <VideoList
                ref={videoListRef}
                projectPath={projectPath}
                videoSnippets={videoSnippets}
                onToolbarStateChange={setVideoListToolbarState}
                onVideosChange={handleVideosChange}
                onCreateClip={(video) => setClipEditingVideo(video)}
                onDeleteVideo={(video) => {
                  // Remove all clips associated with this video
                  setVideoSnippets(videoSnippets.filter((s) => s.videoFile !== video.relativePath));
                }}
              />
            )}

            {activeView === "video-snippets" && (
              showVideoForm ? (
                <div className="rounded-lg p-5" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                  <VideoSnippetForm
                    snippet={editingVideoSnippet}
                    onSave={handleVideoSave}
                    hotkeyOwners={hotkeyOwners}
                    onSaveStateChange={setVideoSnippetSaveState}
                  />
                </div>
              ) : (
                <VideoSnippetList
                  snippets={videoSnippets}
                  onEdit={handleVideoEdit}
                  onDelete={handleVideoDelete}
                  onPlay={playVideo}
                  onDuplicate={handleVideoDuplicate}
                  onBrowseVideos={() => setActiveView("videos")}
                  hotkeyOwners={hotkeyOwners}
                  availableVideoFiles={availableVideoFiles ?? undefined}
                />
              )
            )}

            {activeView === "automations" && (
              <>
                {showScriptForm ? (
                  <div className="rounded-lg p-5" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                    <ScriptForm
                      script={editingScript}
                      onSave={handleScriptSave}
                      hotkeyOwners={hotkeyOwners}
                      onSaveStateChange={setScriptSaveState}
                    />
                  </div>
                ) : (
                  <ScriptList
                    automations={automations}
                    onEdit={handleScriptEdit}
                    onDelete={handleScriptDelete}
                    onRun={handleRunScript}
                    onDuplicate={handleScriptDuplicate}
                    onAdd={() => {
                      setEditingScript(undefined);
                      setShowScriptForm(true);
                    }}
                    runningScriptId={runningScriptId}
                    runHistory={automationRunHistory}
                    hotkeyOwners={hotkeyOwners}
                  />
                )}
              </>
            )}
            {activeView === "hotkeys" && (
              <HotkeysTable
                textSnippets={textSnippets}
                videoSnippets={videoSnippets}
                automations={automations}
                demoMode={demoMode}
                issues={demoHotkeyIssues}
                syncError={demoHotkeySyncError}
                onChangeHotkey={changeOwnerHotkey}
                onOpen={openHotkeyOwner}
              />
            )}
            {activeView === "stream-deck" && <StreamDeckPreview />}


            </>
            )}
          </div>
          </ErrorBoundary>
        </main>
      </div>

      <TrayHint />
      <StatusBar projectPath={projectPath} demoMode={demoMode} />
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          data-testid={confirmDialog.testId ?? "confirm-delete-dialog"}
        />
      )}

      {paletteOpen && <CommandPalette commands={buildCommands(commandContext)} onClose={() => setPaletteOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {settingsDialog}
      {demoStartOpen && <DemoStartDialog preflight={preflight} onStart={() => void enterDemoMode()} onClose={() => setDemoStartOpen(false)} />}

    </div>
  );
}

/* ── Content header with title + add button ── */
const VIEW_LABELS: Record<AppView, string> = {
  home: "Overview",
  "text-snippets": "Snippets",
  videos: "Clips",
  "video-snippets": "Clips",
  automations: "Automations",
  hotkeys: "Hotkeys",
  "stream-deck": "Stream Deck",
};

function ContentHeader({
  view,
  editLabel,
  showForm,
  onAdd,
  onCloseForm,
  saveAction,
  videoImporting,
  onImportVideo,
}: {
  view: AppView;
  editLabel?: string;
  showForm: boolean;
  onAdd: () => void;
  onCloseForm: () => void;
  videoImporting?: boolean;
  onImportVideo?: () => void;
  saveAction?: {
    label: string;
    state: ClipEditorSaveState;
    testId: string;
    cancelTestId: string;
    onClick?: () => void;
    form?: string;
  };
}) {
  const canAdd = view === "text-snippets" || view === "video-snippets" || view === "automations";

  const primaryAction: ToolbarAction | undefined = showForm && saveAction
    ? {
      label: saveAction.label,
      icon: <Save size={12} />,
      onClick: saveAction.onClick,
      form: saveAction.form,
      type: saveAction.form ? "submit" : "button",
      disabled: !saveAction.state.canSave,
      testId: saveAction.testId,
      tone: "primary",
    }
    : view === "videos" && !showForm
      ? {
      label: videoImporting ? "Importing..." : "Import Video",
      icon: <Upload size={12} />,
      onClick: onImportVideo,
      disabled: videoImporting,
      testId: "import-video",
      tone: "primary",
    }
    : canAdd && !showForm
    ? {
        label: "Add",
        icon: <Plus size={12} />,
        onClick: onAdd,
        testId: view === "text-snippets" ? "add-snippet" : view === "video-snippets" ? "add-video-snippet" : "add-automation",
        tone: "primary",
      }
      : undefined;

  const secondaryAction: ToolbarAction | undefined = showForm
    ? {
      label: "Close",
      icon: <XIcon size={12} />,
      onClick: onCloseForm,
      testId: saveAction?.cancelTestId,
      tone: "secondary",
    }
    : undefined;

  return (
    <SectionToolbar
      title={editLabel ?? VIEW_LABELS[view]}
      status={showForm
        ? saveAction?.state.saveStatus === "saved" ? "Saved" : saveAction?.state.readinessText
        : undefined}
      statusTestId={saveAction?.testId === "clip-save"
        ? "clip-readiness"
        : saveAction?.testId ? `${saveAction.testId}-status` : undefined}
      statusTone={showForm && saveAction?.state.canSave ? "success" : "muted"}
      actions={[]}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    />
  );
}

export default App;
