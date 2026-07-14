import { useEffect, useRef, useState, useCallback } from "react";
import { useProjectStore } from "./stores/projectStore";
import { useUpdateStore } from "./stores/updateStore";
import { Plus, AlertTriangle, X as XIcon, Circle, Square, CheckCircle, Radio, Save, Upload } from "lucide-react";
import Welcome from "./components/Welcome";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import TrayHint from "./components/TrayHint";
import FFmpegHelper from "./components/FFmpegHelper";
import TextSnippetList from "./components/TextSnippetList";
import TextSnippetForm from "./components/TextSnippetForm";
import VideoList, { type VideoListHandle, type VideoListToolbarState } from "./components/VideoList";
import ClipEditor, { type ClipEditorHandle, type ClipEditorSaveState } from "./components/ClipEditor";
import VideoSnippetList from "./components/VideoSnippetList";
import HotkeyOverview from "./components/HotkeyOverview";
import VideoSnippetForm from "./components/VideoSnippetForm";
import ScriptList, { type AutomationRunHistoryItem } from "./components/ScriptList";
import ScriptForm from "./components/ScriptForm";
import ConfirmDialog from "./components/ConfirmDialog";
import SectionToolbar, { type ToolbarAction } from "./components/SectionToolbar";
import ToastViewport, { type ToastMessage, type ToastTone } from "./components/ToastViewport";
import ErrorBoundary from "./components/ErrorBoundary";
import { getBackend } from "./services";
import { auditaurListen } from "./services/auditaur";
import { collectHotkeyOwners } from "./utils/hotkeys";
import { traySurfaceName } from "./utils/platform";
import type { TextSnippet, VideoSnippet, Script, ImportedVideo } from "./types";
import type { AppView } from "./components/Sidebar";

const backend = getBackend();

const DEFAULT_SAVE_STATE: ClipEditorSaveState = {
  canSave: false,
  readinessText: "Needs required fields",
  saveStatus: "idle",
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
  const scripts = useProjectStore((s) => s.scripts);
  const saveScript = useProjectStore((s) => s.saveScript);
  const deleteScriptFromStore = useProjectStore((s) => s.deleteScript);
  const demoMode = useProjectStore((s) => s.demoMode);
  const enterDemoMode = useProjectStore((s) => s.enterDemoMode);
  const exitDemoMode = useProjectStore((s) => s.exitDemoMode);
  const playVideo = useProjectStore((s) => s.playVideo);
  const ffmpegAvailable = useProjectStore((s) => s.ffmpegAvailable);
  const checkFfmpeg = useProjectStore((s) => s.checkFfmpeg);
  const closeProject = useProjectStore((s) => s.closeProject);
  const autoOpenLastProject = useProjectStore((s) => s.autoOpenLastProject);

  const [activeView, setActiveView] = useState<AppView>("home");
  const [showForm, setShowForm] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<TextSnippet | undefined>(undefined);
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [editingVideoSnippet, setEditingVideoSnippet] = useState<VideoSnippet | undefined>(undefined);
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | undefined>(undefined);
  const [showFfmpegHelper, setShowFfmpegHelper] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [clipEditingVideo, setClipEditingVideo] = useState<ImportedVideo | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);
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
  const loadScripts = useProjectStore((s) => s.loadScripts);
  const hotkeyOwners = collectHotkeyOwners(textSnippets, videoSnippets, scripts);

  const showToast = useCallback((title: string, detail?: string, tone: ToastTone = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title, detail, tone }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  // Auto-open last project on startup
  useEffect(() => {
    void autoOpenLastProject();
    void checkFfmpeg();
    // Silent update check on startup
    useUpdateStore.getState().checkForUpdate();
  }, [autoOpenLastProject, checkFfmpeg]);

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
        deleteScriptFromStore(id);
        setConfirmDialog(null);
      },
    });
  };
  const handleScriptSave = (script: Script) => {
    saveScript(script);
    setShowScriptForm(false);
    setEditingScript(undefined);
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

  const requestCloseActiveEditor = useCallback(() => {
    const activeSaveState = clipEditingVideo
      ? clipSaveState
      : showForm
        ? textSnippetSaveState
        : showVideoForm
          ? videoSnippetSaveState
          : showScriptForm
            ? scriptSaveState
            : null;

    if (!activeSaveState || activeSaveState.saveStatus === "saved") {
      closeActiveEditor();
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

  // -- Recording handlers --
  const handleStartRecording = useCallback(async () => {
    if (!projectPath) return;
    try {
      await backend.startRecordingScript(projectPath);
      setIsRecording(true);
    } catch (e) {
      showToast("Failed to start recording", String(e), "error");
    }
  }, [projectPath, showToast]);

  const handleStopRecording = useCallback(async () => {
    if (!projectPath) return;
    setShowRecordingDialog(true);
  }, [projectPath]);

  const handleSaveRecording = useCallback(async (title: string, description: string) => {
    if (!projectPath) return;
    try {
      await backend.stopRecordingScript(projectPath, title, description);
      setIsRecording(false);
      setShowRecordingDialog(false);
      await loadScripts();
    } catch (e) {
      showToast("Failed to save recording", String(e), "error");
    }
  }, [projectPath, loadScripts, showToast]);

  const handleRunScript = useCallback(async (scriptId: string) => {
    if (!projectPath) return;
    const scriptTitle = scripts.find((script) => script.id === scriptId)?.title ?? "Automation";
    setRunningScriptId(scriptId);
    try {
      const outputVideo = await backend.runScript(projectPath, scriptId);
      showToast("Automation completed", `Output saved to ${outputVideo}`, "success");
      const historyItem: AutomationRunHistoryItem = {
        scriptId,
        title: scriptTitle,
        status: "success",
        message: `Output saved to ${outputVideo}`,
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
  }, [projectPath, scripts, showToast]);

  const handleToggleDemo = () => {
    if (demoMode) exitDemoMode();
    else enterDemoMode();
  };

  // ── Welcome screen (no project loaded) ──
  if (!projectName) {
    return (
      <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
        <TitleBar projectName={null} demoMode={false} onToggleDemo={() => {}} />
        <div className="flex-1 flex items-center justify-center">
          <Welcome />
        </div>
        <TrayHint />
        <StatusBar projectPath={null} ffmpegAvailable={null} demoMode={false} />
      </div>
    );
  }

  // ── Main app layout ──
  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <TitleBar projectName={projectName} demoMode={demoMode} onToggleDemo={handleToggleDemo} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} onViewChange={(view) => {
          if (clipEditingVideo) {
            setClipEditingVideo(null);
            setEditingVideoSnippet(undefined);
          }
          setActiveView(view);
        }} onGoHome={closeProject} />

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
              (activeView === "scripts" && showScriptForm)
            }
            isRecording={isRecording}
            onRecord={handleStartRecording}
            onStopRecord={handleStopRecording}
            onAdd={() => {
              if (activeView === "text-snippets") {
                setEditingSnippet(undefined);
                setShowForm(true);
              } else if (activeView === "video-snippets") {
                setEditingVideoSnippet(undefined);
                setShowVideoForm(true);
              } else if (activeView === "scripts") {
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
                      form: "script-editor-form",
                      testId: "script-save",
                      cancelTestId: "script-cancel",
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
                <DemoReadinessPanel
                  textCount={textSnippets.length}
                  videoCount={videoSnippets.length}
                  automationCount={scripts.length}
                  demoMode={demoMode}
                  ffmpegAvailable={ffmpegAvailable}
                />
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
                <TextSnippetList snippets={textSnippets} onEdit={handleEdit} onDelete={handleDelete} onReorder={setTextSnippets} />
              )
            )}

            {activeView === "videos" && projectPath && (
              <VideoList
                ref={videoListRef}
                projectPath={projectPath}
                videoSnippets={videoSnippets}
                onToolbarStateChange={setVideoListToolbarState}
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
                />
              )
            )}

            {activeView === "scripts" && (
              <>
                {isRecording && (
                  <div
                    className="mb-4 p-3 rounded-lg text-base flex items-center gap-2 w-full"
                    data-testid="recording-indicator"
                    style={{
                      backgroundColor: "var(--color-surface-inset)",
                      border: "1px solid var(--color-danger)",
                      color: "var(--color-danger)",
                    }}
                  >
                    <Circle size={10} fill="currentColor" className="animate-pulse" />
                    <span className="font-medium">Recording in progress...</span>
                    <button
                      onClick={handleStopRecording}
                      className="ml-auto flex items-center gap-1 px-3 py-1 rounded text-sm font-medium"
                      style={{ backgroundColor: "var(--color-danger)", color: "var(--color-text-on-accent)" }}
                      data-testid="stop-recording"
                    >
                      <Square size={10} fill="currentColor" /> Stop Recording
                    </button>
                  </div>
                )}
                {showRecordingDialog && (
                  <RecordingSaveDialog
                    onSave={handleSaveRecording}
                    onCancel={() => { setShowRecordingDialog(false); }}
                  />
                )}
                {ffmpegAvailable === false && (
                  <button
                    onClick={() => setShowFfmpegHelper(true)}
                    className="mb-4 p-3 rounded-lg text-base flex items-center gap-2 w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
                    data-testid="ffmpeg-warning"
                    style={{
                      backgroundColor: "var(--color-surface-inset)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-warning)",
                    }}
                  >
                    <AlertTriangle size={14} /> FFmpeg not found — click to install
                  </button>
                )}
                {showScriptForm ? (
                  <div className="rounded-lg p-5" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                    <ScriptForm
                      script={editingScript}
                      onSave={handleScriptSave}
                      onSaveStateChange={setScriptSaveState}
                    />
                  </div>
                ) : (
                  <ScriptList
                    scripts={scripts}
                    onEdit={handleScriptEdit}
                    onDelete={handleScriptDelete}
                    onRun={handleRunScript}
                    runningScriptId={runningScriptId}
                    runHistory={automationRunHistory}
                  />
                )}
              </>
            )}
            </>
            )}
          </div>
          </ErrorBoundary>
        </main>
      </div>

      <TrayHint />
      <StatusBar projectPath={projectPath} ffmpegAvailable={ffmpegAvailable} demoMode={demoMode} onFfmpegClick={() => setShowFfmpegHelper(true)} />
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

      {showFfmpegHelper && (
        <FFmpegHelper
          onClose={() => setShowFfmpegHelper(false)}
          onFixed={() => { setShowFfmpegHelper(false); checkFfmpeg(); }}
        />
      )}
    </div>
  );
}

function DemoReadinessPanel({
  textCount,
  videoCount,
  automationCount,
  demoMode,
  ffmpegAvailable,
}: {
  textCount: number;
  videoCount: number;
  automationCount: number;
  demoMode: boolean;
  ffmpegAvailable: boolean | null;
}) {
  const deliverableCount = textCount + videoCount;
  const ready = deliverableCount > 0;

  return (
    <section
      className="rounded-lg p-4"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="demo-readiness-panel"
      aria-label="Demo readiness"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-md font-semibold flex items-center gap-2" style={{ color: "var(--color-text)" }}>
            <Radio size={16} style={{ color: demoMode ? "var(--color-danger)" : "var(--color-accent)" }} />
            {demoMode ? "Demo Mode is live" : "Demo readiness"}
          </h3>
          <p className="text-base mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Demo Mode hides Snipsy to the {traySurfaceName()} and listens for your configured hotkeys.
          </p>
        </div>
        <span
          className="text-sm px-2 py-1 rounded font-medium"
          style={{
            backgroundColor: demoMode ? "var(--color-danger)" : ready ? "var(--color-success)" : "var(--color-surface-inset)",
            color: demoMode || ready ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
          }}
          data-testid="demo-readiness-status"
        >
          {demoMode ? "Live" : ready ? "Ready" : "Needs hotkeys"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <ReadinessItem ready={textCount > 0} label={`${textCount} text hotkey${textCount === 1 ? "" : "s"}`} />
        <ReadinessItem ready={videoCount > 0} label={`${videoCount} clip hotkey${videoCount === 1 ? "" : "s"}`} />
        <ReadinessItem ready={automationCount > 0} label={`${automationCount} automation${automationCount === 1 ? "" : "s"}`} />
      </div>
      {ffmpegAvailable === false && (
        <p className="text-sm mt-3 flex items-center gap-1" style={{ color: "var(--color-warning)" }} data-testid="demo-readiness-warning">
          <AlertTriangle size={13} /> FFmpeg is missing, so automation run recordings may not be available.
        </p>
      )}
    </section>
  );
}

function ReadinessItem({ ready, label }: { ready: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded px-3 py-2 text-base"
      style={{ backgroundColor: "var(--color-surface-inset)", color: ready ? "var(--color-text)" : "var(--color-text-secondary)" }}
    >
      {ready
        ? <CheckCircle size={14} style={{ color: "var(--color-success)" }} />
        : <Circle size={10} style={{ color: "var(--color-text-secondary)" }} />
      }
      <span>{label}</span>
    </div>
  );
}

/* ── Content header with title + add button ── */
const VIEW_LABELS: Record<AppView, string> = {
  home: "Hotkey Overview",
  "text-snippets": "Text Snippets",
  videos: "Videos",
  "video-snippets": "Video Clips",
  scripts: "Automations",
};

function ContentHeader({
  view,
  editLabel,
  showForm,
  isRecording,
  onRecord,
  onStopRecord,
  onAdd,
  onCloseForm,
  saveAction,
  videoImporting,
  onImportVideo,
}: {
  view: AppView;
  editLabel?: string;
  showForm: boolean;
  isRecording?: boolean;
  onRecord?: () => void;
  onStopRecord?: () => void;
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
  const canAdd = view !== "videos" && view !== "home";
  const actions: ToolbarAction[] = [];

  if (view === "scripts" && !showForm && !isRecording) {
    actions.push({
      label: "Record",
      icon: <Circle size={10} fill="currentColor" />,
      onClick: onRecord,
      testId: "record-script",
      tone: "danger",
    });
  }

  if (view === "scripts" && isRecording) {
    actions.push({
      label: "Stop",
      icon: <Square size={10} fill="currentColor" />,
      onClick: onStopRecord,
      testId: "stop-recording-header",
      tone: "danger",
    });
  }

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
        testId: view === "text-snippets" ? "add-snippet" : view === "video-snippets" ? "add-video-snippet" : "add-script",
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
      actions={actions}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    />
  );
}

/* ── Recording save dialog ── */
function RecordingSaveDialog({
  onSave,
  onCancel,
}: {
  onSave: (title: string, description: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div
      className="mb-4 rounded-lg p-5"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="recording-save-dialog"
    >
      <h3 className="text-md font-semibold mb-3" style={{ color: "var(--color-text)" }}>
        Save Recorded Automation
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Recorded Automation"
            className="w-full rounded px-3 py-1.5 text-base"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="recording-title"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full rounded px-3 py-1.5 text-base"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="recording-description"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-sm font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(title || "Untitled Recording", description)}
            className="px-4 py-1.5 rounded text-sm font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
            data-testid="recording-save"
          >
            Save Automation
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
