import { useProjectStore } from "./stores/projectStore";
import Welcome from "./components/Welcome";

function App() {
  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);

  if (!projectName) {
    return <Welcome />;
  }

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
      <main className="p-6">
        <p className="text-gray-500">
          Project editor — snippets will appear here.
        </p>
      </main>
    </div>
  );
}

export default App;
