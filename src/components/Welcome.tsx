import { useState } from "react";
import { useProjectStore, type RecentProject } from "../stores/projectStore";
import { FolderOpen, FolderPlus, FolderSearch, X, Clock } from "lucide-react";
import appIcon from "../assets/icon.png";

/** Deterministic hue from a string (for project avatars) */
function hashHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return ((hash % 360) + 360) % 360;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Welcome() {
  const [showForm, setShowForm] = useState<"open" | "create" | null>(null);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openProject = useProjectStore((s) => s.openProject);
  const createProject = useProjectStore((s) => s.createProject);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const removeRecent = useProjectStore((s) => s.removeRecentProject);

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: showForm === "open" ? "Open project folder" : "Choose project folder",
      });
      if (selected) setPath(selected);
    } catch {
      // Not in Tauri
    }
  };

  const handleOpen = async () => {
    if (!path.trim()) return;
    try {
      setError(null);
      await openProject(path.trim());
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreate = async () => {
    if (!path.trim() || !name.trim()) return;
    try {
      setError(null);
      await createProject(path.trim(), name.trim(), description.trim());
    } catch (e) {
      setError(String(e));
    }
  };

  const handleOpenRecent = async (project: RecentProject) => {
    try {
      setError(null);
      await openProject(project.path);
    } catch (e) {
      setError(`Failed to open ${project.name}: ${e}`);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-2xl">
        {/* Hero / branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
            style={{ background: "linear-gradient(135deg, #5856d6 0%, #7c7af0 100%)" }}>
            <img src={appIcon} alt="Snipsy" className="w-10 h-10" draggable={false} />
          </div>
          <h1 className="text-[22px] font-bold mb-1" style={{ color: "var(--color-text)" }}>
            Snipsy
          </h1>
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Manage text and video snippets for live presentations.
          </p>
        </div>

        <div className="flex gap-6" style={{ minHeight: 280 }}>
          {/* Left column: Action cards + inline form */}
          <div className="flex-1 space-y-3">
            {/* Action cards (only show when form is not open) */}
            {!showForm && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setShowForm("open"); setError(null); }}
                  className="flex flex-col items-center gap-2 p-5 rounded-lg text-[13px] font-medium transition-all hover:shadow-md"
                  style={{
                    backgroundColor: "var(--color-surface-alt)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  <FolderOpen size={24} style={{ color: "var(--color-accent)" }} />
                  Open Project
                  <span className="text-[11px] font-normal" style={{ color: "var(--color-text-secondary)" }}>
                    Pick an existing folder
                  </span>
                </button>
                <button
                  onClick={() => { setShowForm("create"); setError(null); }}
                  className="flex flex-col items-center gap-2 p-5 rounded-lg text-[13px] font-medium transition-all hover:shadow-md"
                  style={{
                    backgroundColor: "var(--color-surface-alt)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  <FolderPlus size={24} style={{ color: "var(--color-success)" }} />
                  New Project
                  <span className="text-[11px] font-normal" style={{ color: "var(--color-text-secondary)" }}>
                    Start from scratch
                  </span>
                </button>
              </div>
            )}

            {/* Inline form */}
            {showForm && (
              <div
                className="rounded-lg p-5 space-y-3"
                style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>
                    {showForm === "open" ? "Open Project" : "New Project"}
                  </h3>
                  <button
                    onClick={() => { setShowForm(null); setError(null); setPath(""); setName(""); setDescription(""); }}
                    className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div>
                  <label className="block font-medium mb-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                    Project Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="/path/to/project"
                      className="flex-1 px-3 py-1.5 rounded text-[13px]"
                      style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                    />
                    <button
                      type="button"
                      onClick={handleBrowse}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium"
                      style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                      data-testid="browse-folder"
                    >
                      <FolderSearch size={14} />
                      Browse
                    </button>
                  </div>
                </div>

                {showForm === "create" && (
                  <>
                    <div>
                      <label className="block font-medium mb-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                        Project Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="My Demo"
                        className="w-full px-3 py-1.5 rounded text-[13px]"
                        style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                        Description
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="A description of this project"
                        className="w-full px-3 py-1.5 rounded text-[13px]"
                        style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                      />
                    </div>
                  </>
                )}

                {error && (
                  <p className="text-[12px]" data-testid="error-message" style={{ color: "var(--color-danger)" }}>
                    {error}
                  </p>
                )}

                <button
                  onClick={showForm === "open" ? handleOpen : handleCreate}
                  className="w-full py-2 px-4 rounded font-medium text-[13px]"
                  style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
                >
                  {showForm === "open" ? "Open" : "Create"}
                </button>
              </div>
            )}
          </div>

          {/* Right column: Recent projects */}
          <div className="flex-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-secondary)" }}>
              Recent Projects
            </h3>
            <div className="space-y-1 max-h-[55vh] overflow-y-auto">
              {recentProjects.length === 0 ? (
                <p className="text-[12px] py-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
                  No recent projects yet.
                </p>
              ) : (
                recentProjects.map((project) => {
                  const hue = hashHue(project.name);
                  return (
                    <div
                      key={project.path}
                      className="group flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all"
                      style={{ border: "1px solid transparent" }}
                      onClick={() => handleOpenRecent(project)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--color-surface-alt)";
                        e.currentTarget.style.borderColor = "var(--color-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.borderColor = "transparent";
                      }}
                      data-testid="recent-project"
                    >
                      {/* Color avatar */}
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ backgroundColor: `hsl(${hue}, 60%, 50%)` }}
                      >
                        {project.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate" style={{ color: "var(--color-text)" }}>
                          {project.name}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                          {project.path}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-text-secondary)" }}>
                          <Clock size={10} /> {relativeTime(project.lastOpened)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeRecent(project.path); }}
                          className="w-5 h-5 items-center justify-center rounded hover:opacity-70 hidden group-hover:flex"
                          style={{ color: "var(--color-text-secondary)" }}
                          title="Remove from recent"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Welcome;
