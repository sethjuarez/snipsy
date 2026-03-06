import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { FolderOpen, FolderPlus, FolderSearch } from "lucide-react";

function Welcome() {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"open" | "create">("open");
  const [error, setError] = useState<string | null>(null);

  const openProject = useProjectStore((s) => s.openProject);
  const createProject = useProjectStore((s) => s.createProject);

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: mode === "open" ? "Open project folder" : "Choose project folder",
      });
      if (selected) setPath(selected);
    } catch {
      // Not in Tauri — ignore, user can still type path manually
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

  return (
    <div className="rounded-lg p-8 max-w-md w-full" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}>
      <h1 className="text-[18px] font-bold mb-6 text-center" style={{ color: "var(--color-text)" }}>
        Snipsy
      </h1>
      <p className="text-[13px] text-center mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Open an existing project or create a new one.
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode("open")}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded font-medium text-[13px]"
          style={mode === "open"
            ? { backgroundColor: "var(--color-accent)", color: "#fff" }
            : { backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
        >
          <FolderOpen size={15} />
          Open Project
        </button>
        <button
          onClick={() => setMode("create")}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded font-medium text-[13px]"
          style={mode === "create"
            ? { backgroundColor: "var(--color-accent)", color: "#fff" }
            : { backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
        >
          <FolderPlus size={15} />
          New Project
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Project Path
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/project"
              className="flex-1 px-3 py-2 rounded text-[13px]"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            <button
              type="button"
              onClick={handleBrowse}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-[12px] font-medium"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              title="Browse for folder"
              data-testid="browse-folder"
            >
              <FolderSearch size={14} />
              Browse
            </button>
          </div>
        </div>

        {mode === "create" && (
          <>
            <div>
              <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Demo"
                className="w-full px-3 py-2 rounded text-[13px]"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A description of this project"
                className="w-full px-3 py-2 rounded text-[13px]"
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
          onClick={mode === "open" ? handleOpen : handleCreate}
          className="w-full py-2 px-4 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
        >
          {mode === "open" ? "Open" : "Create"}
        </button>
      </div>
    </div>
  );
}

export default Welcome;
