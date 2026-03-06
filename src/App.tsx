import { useState } from "react";
import { useProjectStore } from "./stores/projectStore";
import Welcome from "./components/Welcome";
import TextSnippetList from "./components/TextSnippetList";
import TextSnippetForm from "./components/TextSnippetForm";
import type { TextSnippet } from "./types";

function App() {
  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);
  const textSnippets = useProjectStore((s) => s.textSnippets);
  const setTextSnippets = useProjectStore((s) => s.setTextSnippets);
  const demoMode = useProjectStore((s) => s.demoMode);
  const enterDemoMode = useProjectStore((s) => s.enterDemoMode);
  const exitDemoMode = useProjectStore((s) => s.exitDemoMode);

  const [showForm, setShowForm] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<TextSnippet | undefined>(
    undefined,
  );

  if (!projectName) {
    return <Welcome />;
  }

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
    const existing = textSnippets.findIndex((s) => s.id === snippet.id);
    if (existing >= 0) {
      const updated = [...textSnippets];
      updated[existing] = snippet;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{projectName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={demoMode ? exitDemoMode : enterDemoMode}
            className={`px-4 py-1.5 text-sm font-medium rounded ${
              demoMode
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
            data-testid="demo-mode-toggle"
          >
            {demoMode ? "Exit Demo Mode" : "Enter Demo Mode"}
          </button>
          {demoMode && (
            <span
              className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium"
              data-testid="demo-mode-indicator"
            >
              LIVE
            </span>
          )}
          <button
            onClick={closeProject}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded"
          >
            Close Project
          </button>
        </div>
      </header>
      <main className="p-6 max-w-4xl mx-auto">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Text Snippets
            </h2>
            {!showForm && (
              <button
                onClick={() => {
                  setEditingSnippet(undefined);
                  setShowForm(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 text-sm"
                data-testid="add-snippet"
              >
                + Add Snippet
              </button>
            )}
          </div>

          {showForm ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
              <TextSnippetForm
                snippet={editingSnippet}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </div>
          ) : (
            <TextSnippetList
              snippets={textSnippets}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
