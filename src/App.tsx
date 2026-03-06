import { useProjectStore } from "./stores/projectStore";
import Welcome from "./components/Welcome";
import TextSnippetList from "./components/TextSnippetList";
import type { TextSnippet } from "./types";

function App() {
  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);
  const textSnippets = useProjectStore((s) => s.textSnippets);
  const setTextSnippets = useProjectStore((s) => s.setTextSnippets);

  if (!projectName) {
    return <Welcome />;
  }

  const handleEdit = (_snippet: TextSnippet) => {
    // Will be implemented in 3.3
  };

  const handleDelete = (id: string) => {
    setTextSnippets(textSnippets.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{projectName}</h1>
        </div>
        <button
          onClick={closeProject}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded"
        >
          Close Project
        </button>
      </header>
      <main className="p-6 max-w-4xl mx-auto">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Text Snippets
            </h2>
          </div>
          <TextSnippetList
            snippets={textSnippets}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
