import { useEffect, useState, useCallback } from "react";
import { useProjectStore } from "./stores/projectStore";
import { useUpdateStore } from "./stores/updateStore";
import { Plus, AlertTriangle, X as XIcon, Circle, Square } from "lucide-react";
import Welcome from "./components/Welcome";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import FFmpegHelper from "./components/FFmpegHelper";
import TextSnippetList from "./components/TextSnippetList";
import TextSnippetForm from "./components/TextSnippetForm";
import VideoList from "./components/VideoList";
import ClipEditor from "./components/ClipEditor";
import VideoSnippetList from "./components/VideoSnippetList";
import VideoSnippetForm from "./components/VideoSnippetForm";
import ScriptList from "./components/ScriptList";
import ScriptForm from "./components/ScriptForm";
import { getBackend } from "./services";
import type { TextSnippet, VideoSnippet, Script, ImportedVideo } from "./types";
import type { AppView } from "./components/Sidebar";

const backend = getBackend();

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
  const closeProject = useProjectStore((s) => s.closeProject);
  const autoOpenLastProject = useProjectStore((s) => s.autoOpenLastProject);

  const [activeView, setActiveView] = useState<AppView>("text-snippets");
  const [showForm, setShowForm] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<TextSnippet | undefined>(undefined);
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [editingVideoSnippet, setEditingVideoSnippet] = useState<VideoSnippet | undefined>(undefined);
  const [showScriptForm, setShowScriptForm] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | undefined>(undefined);
  const [showFfmpegHelper, setShowFfmpegHelper] = useState(false);
  const [clipEditingVideo, setClipEditingVideo] = useState<ImportedVideo | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);
  const checkFfmpeg = useProjectStore((s) => s.checkFfmpeg);
  const loadScripts = useProjectStore((s) => s.loadScripts);

  // Auto-open last project on startup
  useEffect(() => {
    autoOpenLastProject();
    // Silent update check on startup
    useUpdateStore.getState().checkForUpdate();
  }, [autoOpenLastProject]);

  // Listen for tray "Exit Demo Mode" event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then((mod) => mod.listen("exit-demo-mode", () => { exitDemoMode(); }))
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => unlisten?.();
  }, [exitDemoMode]);

  // -- Text snippet handlers --
  const handleEdit = (snippet: TextSnippet) => {
    setEditingSnippet(snippet);
    setShowForm(true);
  };
  const handleDelete = (id: string) => {
    if (window.confirm("Delete this snippet?")) {
      setTextSnippets(textSnippets.filter((s) => s.id !== id));
    }
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
    setShowForm(false);
    setEditingSnippet(undefined);
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
        setActiveView("videos");
        return;
      }
    }
    // Fallback to form if video not found
    setEditingVideoSnippet(snippet);
    setShowVideoForm(true);
  };
  const handleVideoDelete = (id: string) => {
    if (window.confirm("Delete this video snippet?")) {
      setVideoSnippets(videoSnippets.filter((s) => s.id !== id));
    }
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
    setShowVideoForm(false);
    setEditingVideoSnippet(undefined);
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
    if (window.confirm("Delete this script?")) {
      deleteScriptFromStore(id);
    }
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

  // -- Recording handlers --
  const handleStartRecording = useCallback(async () => {
    if (!projectPath) return;
    try {
      await backend.startRecordingScript(projectPath);
      setIsRecording(true);
    } catch (e) {
      alert(`Failed to start recording: ${e}`);
    }
  }, [projectPath]);

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
      alert(`Failed to save recording: ${e}`);
    }
  }, [projectPath, loadScripts]);

  const handleRunScript = useCallback(async (scriptId: string) => {
    if (!projectPath) return;
    try {
      const outputVideo = await backend.runScript(projectPath, scriptId);
      alert(`Script completed! Output saved to: ${outputVideo}`);
    } catch (e) {
      alert(`Script execution failed: ${e}`);
    }
  }, [projectPath]);

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
        <StatusBar projectPath={null} ffmpegAvailable={null} demoMode={false} />
      </div>
    );
  }

  // ── Main app layout ──
  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <TitleBar projectName={projectName} demoMode={demoMode} onToggleDemo={handleToggleDemo} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} onGoHome={closeProject} />

        {/* Content area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Content header */}
          <ContentHeader
            view={activeView}
            showForm={
              (activeView === "text-snippets" && showForm) ||
              (activeView === "video-snippets" && showVideoForm) ||
              (activeView === "videos" && clipEditingVideo !== null) ||
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
            onCloseForm={() => {
              handleCancel();
              handleVideoCancel();
              handleScriptCancel();
              setClipEditingVideo(null);
              setEditingVideoSnippet(undefined);
            }}
          />

          {/* Scrollable content — use overflow-hidden when clip editor is active */}
          <div className={`flex-1 p-4 ${activeView === "videos" && clipEditingVideo ? "overflow-hidden" : "overflow-y-auto"}`}>
            {activeView === "text-snippets" && (
              showForm ? (
                <div className="rounded-lg p-5" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                  <TextSnippetForm snippet={editingSnippet} onSave={handleSave} onCancel={handleCancel} />
                </div>
              ) : (
                <TextSnippetList snippets={textSnippets} onEdit={handleEdit} onDelete={handleDelete} onReorder={setTextSnippets} />
              )
            )}

            {activeView === "videos" && projectPath && (
              clipEditingVideo ? (
                <div className="h-full rounded-lg p-4" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                  <ClipEditor
                    video={clipEditingVideo}
                    existingClip={editingVideoSnippet}
                    onSave={(clip) => {
                      if (editingVideoSnippet) {
                        // Update existing snippet
                        const idx = videoSnippets.findIndex((s) => s.id === editingVideoSnippet.id);
                        if (idx >= 0) {
                          const updated = [...videoSnippets];
                          updated[idx] = { id: editingVideoSnippet.id, ...clip };
                          setVideoSnippets(updated);
                        }
                      } else {
                        // Create new snippet
                        const newSnippet: VideoSnippet = {
                          id: crypto.randomUUID(),
                          ...clip,
                        };
                        setVideoSnippets([...videoSnippets, newSnippet]);
                      }
                      setClipEditingVideo(null);
                      setEditingVideoSnippet(undefined);
                      setActiveView("video-snippets");
                    }}
                    onCancel={() => {
                      setClipEditingVideo(null);
                      setEditingVideoSnippet(undefined);
                    }}
                  />
                </div>
              ) : (
                <VideoList
                  projectPath={projectPath}
                  videoSnippets={videoSnippets}
                  onCreateClip={(video) => setClipEditingVideo(video)}
                  onDeleteVideo={(video) => {
                    // Remove all clips associated with this video
                    setVideoSnippets(videoSnippets.filter((s) => s.videoFile !== video.relativePath));
                  }}
                />
              )
            )}

            {activeView === "video-snippets" && (
              showVideoForm ? (
                <div className="rounded-lg p-5" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
                  <VideoSnippetForm snippet={editingVideoSnippet} onSave={handleVideoSave} onCancel={handleVideoCancel} />
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
                    className="mb-4 p-3 rounded-lg text-[12px] flex items-center gap-2 w-full"
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
                      className="ml-auto flex items-center gap-1 px-3 py-1 rounded text-[11px] font-medium"
                      style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
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
                    className="mb-4 p-3 rounded-lg text-[12px] flex items-center gap-2 w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
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
                    <ScriptForm script={editingScript} onSave={handleScriptSave} onCancel={handleScriptCancel} />
                  </div>
                ) : (
                  <ScriptList scripts={scripts} onEdit={handleScriptEdit} onDelete={handleScriptDelete} onRun={handleRunScript} />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <StatusBar projectPath={projectPath} ffmpegAvailable={ffmpegAvailable} demoMode={demoMode} onFfmpegClick={() => setShowFfmpegHelper(true)} />

      {showFfmpegHelper && (
        <FFmpegHelper
          onClose={() => setShowFfmpegHelper(false)}
          onFixed={() => { setShowFfmpegHelper(false); checkFfmpeg(); }}
        />
      )}
    </div>
  );
}

/* ── Content header with title + add button ── */
const VIEW_LABELS: Record<AppView, string> = {
  "text-snippets": "Text Snippets",
  videos: "Videos",
  "video-snippets": "Video Clips",
  scripts: "Scripts",
};

function ContentHeader({
  view,
  showForm,
  isRecording,
  onRecord,
  onStopRecord,
  onAdd,
  onCloseForm,
}: {
  view: AppView;
  showForm: boolean;
  isRecording?: boolean;
  onRecord?: () => void;
  onStopRecord?: () => void;
  onAdd: () => void;
  onCloseForm: () => void;
}) {
  const canAdd = view !== "videos";

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: 40,
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>
        {VIEW_LABELS[view]}
      </h2>
      <div className="flex items-center gap-2">
        {view === "scripts" && !showForm && !isRecording && (
          <button
            onClick={onRecord}
            className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-medium"
            style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
            data-testid="record-script"
          >
            <Circle size={10} fill="currentColor" /> Record
          </button>
        )}
        {view === "scripts" && isRecording && (
          <button
            onClick={onStopRecord}
            className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-medium animate-pulse"
            style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
            data-testid="stop-recording-header"
          >
            <Square size={10} fill="currentColor" /> Stop
          </button>
        )}
        {canAdd && !showForm && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            data-testid={
              view === "text-snippets" ? "add-snippet" :
              view === "video-snippets" ? "add-video-snippet" :
              "add-script"
            }
          >
            <Plus size={12} /> Add
          </button>
        )}
        {showForm && (
          <button
            onClick={onCloseForm}
            className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
          >
            <XIcon size={12} /> Cancel
          </button>
        )}
      </div>
    </div>
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
      <h3 className="text-[13px] font-semibold mb-3" style={{ color: "var(--color-text)" }}>
        Save Recorded Script
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Recorded Script"
            className="w-full rounded px-3 py-1.5 text-[12px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="recording-title"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full rounded px-3 py-1.5 text-[12px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="recording-description"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-[11px] font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(title || "Untitled Recording", description)}
            className="px-4 py-1.5 rounded text-[11px] font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            data-testid="recording-save"
          >
            Save Script
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
