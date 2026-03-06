import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";

function Welcome() {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"open" | "create">("open");
  const [error, setError] = useState<string | null>(null);

  const openProject = useProjectStore((s) => s.openProject);
  const createProject = useProjectStore((s) => s.createProject);

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          Snipsy
        </h1>
        <p className="text-gray-500 text-center mb-6">
          Open an existing project or create a new one.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("open")}
            className={`flex-1 py-2 px-4 rounded font-medium ${
              mode === "open"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            Open Project
          </button>
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-2 px-4 rounded font-medium ${
              mode === "create"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            New Project
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Path
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/project"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mode === "create" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Demo"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A description of this project"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-red-600 text-sm" data-testid="error-message">
              {error}
            </p>
          )}

          <button
            onClick={mode === "open" ? handleOpen : handleCreate}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          >
            {mode === "open" ? "Open" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Welcome;
