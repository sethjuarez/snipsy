import { useProjectStore } from "./stores/projectStore";

function App() {
  const projectName = useProjectStore((s) => s.projectName);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Snipsy</h1>
        {projectName && (
          <p className="mt-2 text-gray-600">Project: {projectName}</p>
        )}
      </div>
    </div>
  );
}

export default App;
