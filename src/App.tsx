import { useState } from "react";
import { useProjectStore } from "./stores/projectStore";
import Welcome from "./components/Welcome";
import TextSnippetList from "./components/TextSnippetList";
import TextSnippetForm from "./components/TextSnippetForm";
import VideoList from "./components/VideoList";
import VideoSnippetList from "./components/VideoSnippetList";
import VideoSnippetForm from "./components/VideoSnippetForm";
import type { TextSnippet, VideoSnippet } from "./types";

function App() {
  const projectName = useProjectStore((s) => s.projectName);
  const projectPath = useProjectStore((s) => s.projectPath);
  const closeProject = useProjectStore((s) => s.closeProject);
  const textSnippets = useProjectStore((s) => s.textSnippets);
  const setTextSnippets = useProjectStore((s) => s.setTextSnippets);
  const videoSnippets = useProjectStore((s) => s.videoSnippets);
  const setVideoSnippets = useProjectStore((s) => s.setVideoSnippets);
  const demoMode = useProjectStore((s) => s.demoMode);
  const enterDemoMode = useProjectStore((s) => s.enterDemoMode);
  const exitDemoMode = useProjectStore((s) => s.exitDemoMode);

  const [showForm, setShowForm] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<TextSnippet | undefined>(
    undefined,
  );
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [editingVideoSnippet, setEditingVideoSnippet] = useState<
    VideoSnippet | undefined
  >(undefined);

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

  const handleVideoEdit = (snippet: VideoSnippet) => {
    setEditingVideoSnippet(snippet);
    setShowVideoForm(true);
  };

  const handleVideoDelete = (id: string) => {
    if (window.confirm("Delete this video snippet?")) {
      setVideoSnippets(videoSnippets.filter((s) => s.id !== id));
    }
  };

  const handleVideoSave = (snippet: VideoSnippet) => {
    const existing = videoSnippets.findIndex((s) => s.id === snippet.id);
    if (existing >= 0) {
      const updated = [...videoSnippets];
      updated[existing] = snippet;
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

        {projectPath && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Videos
            </h2>
            <VideoList projectPath={projectPath} />
          </section>
        )}

        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Video Snippets
            </h2>
            {!showVideoForm && (
              <button
                onClick={() => {
                  setEditingVideoSnippet(undefined);
                  setShowVideoForm(true);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded font-medium hover:bg-purple-700 text-sm"
                data-testid="add-video-snippet"
              >
                + Add Video Snippet
              </button>
            )}
          </div>

          {showVideoForm ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
              <VideoSnippetForm
                snippet={editingVideoSnippet}
                onSave={handleVideoSave}
                onCancel={handleVideoCancel}
              />
            </div>
          ) : (
            <VideoSnippetList
              snippets={videoSnippets}
              onEdit={handleVideoEdit}
              onDelete={handleVideoDelete}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
