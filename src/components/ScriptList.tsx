import type { Script } from "../types";

interface ScriptListProps {
  scripts: Script[];
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
}

function ScriptList({ scripts, onEdit, onDelete }: ScriptListProps) {
  if (scripts.length === 0) {
    return (
      <div
        className="text-center py-8 text-gray-400"
        data-testid="script-empty-state"
      >
        <p className="text-lg">No scripts yet</p>
        <p className="text-sm mt-1">
          Create a script to automate demo recordings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="script-list">
      {scripts.map((script) => (
        <div
          key={script.id}
          className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
          data-testid={`script-${script.id}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-gray-900 truncate">
                {script.title}
              </h3>
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                {script.steps.length} step{script.steps.length !== 1 && "s"}
              </span>
            </div>
            {script.description && (
              <p className="text-sm text-gray-500 mt-0.5 truncate">
                {script.description}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              Output: {script.outputVideo}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onEdit(script)}
              className="text-sm text-blue-600 hover:text-blue-800"
              data-testid={`script-edit-${script.id}`}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(script.id)}
              className="text-sm text-red-600 hover:text-red-800"
              data-testid={`script-delete-${script.id}`}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ScriptList;
