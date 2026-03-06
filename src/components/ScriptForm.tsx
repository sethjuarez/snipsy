import { useState } from "react";
import type { Script, ScriptStep } from "../types";

interface ScriptFormProps {
  script?: Script;
  onSave: (script: Script) => void;
  onCancel: () => void;
}

const EMPTY_STEP: ScriptStep = { action: "wait", duration: 1000 };

function createDefaultStep(action: string): ScriptStep {
  switch (action) {
    case "wait":
      return { action: "wait", duration: 1000 };
    case "type":
      return { action: "type", text: "", delay: 50 };
    case "keypress":
      return { action: "keypress", key: "Enter" };
    case "click":
      return { action: "click", x: 0, y: 0 };
    case "launch":
      return { action: "launch", target: "" };
    case "scroll":
      return { action: "scroll", delta: -3 };
    default:
      return EMPTY_STEP;
  }
}

function ScriptForm({ script, onSave, onCancel }: ScriptFormProps) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [description, setDescription] = useState(script?.description ?? "");
  const [outputVideo, setOutputVideo] = useState(
    script?.outputVideo ?? "videos/output.mp4",
  );
  const [steps, setSteps] = useState<ScriptStep[]>(script?.steps ?? []);

  const addStep = () => {
    setSteps([...steps, structuredClone(EMPTY_STEP)]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepAction = (index: number, newAction: string) => {
    const updated = [...steps];
    updated[index] = createDefaultStep(newAction);
    setSteps(updated);
  };

  const updateStepField = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value } as ScriptStep;
    setSteps(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !outputVideo.trim()) return;

    onSave({
      id: script?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      steps,
      outputVideo: outputVideo.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="script-form"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Script title"
            required
            className="w-full px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="script-title"
          />
        </div>
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Output Video
          </label>
          <input
            type="text"
            value={outputVideo}
            onChange={(e) => setOutputVideo(e.target.value)}
            placeholder="videos/output.mp4"
            required
            className="w-full px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="script-output"
          />
        </div>
      </div>

      <div>
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 rounded text-[13px]"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="script-description"
        />
      </div>

      <div data-testid="script-steps-section">
        <div className="flex items-center justify-between mb-2">
          <label className="block font-medium text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Steps
          </label>
          <button
            type="button"
            onClick={addStep}
            className="text-[12px] font-medium"
            style={{ color: "var(--color-accent)" }}
            data-testid="add-step"
          >
            + Add Step
          </button>
        </div>
        {steps.length === 0 && (
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }} data-testid="no-steps">
            No steps yet. Add steps to define the script.
          </p>
        )}
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex items-center gap-2 mb-2 p-2 rounded"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border-subtle)" }}
            data-testid={`step-${index}`}
          >
            <select
              value={step.action}
              onChange={(e) => updateStepAction(index, e.target.value)}
              className="px-2 py-1 rounded text-[12px]"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`step-action-${index}`}
            >
              <option value="wait">Wait</option>
              <option value="type">Type</option>
              <option value="keypress">Keypress</option>
              <option value="click">Click</option>
              <option value="launch">Launch</option>
              <option value="scroll">Scroll</option>
            </select>

            {step.action === "wait" && (
              <input
                type="number"
                value={(step as { duration: number }).duration}
                onChange={(e) =>
                  updateStepField(index, "duration", Number(e.target.value))
                }
                placeholder="ms"
                className="w-24 px-2 py-1 rounded text-[12px]"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`step-duration-${index}`}
              />
            )}
            {step.action === "type" && (
              <>
                <input
                  type="text"
                  value={(step as { text: string }).text}
                  onChange={(e) =>
                    updateStepField(index, "text", e.target.value)
                  }
                  placeholder="Text to type"
                  className="flex-1 px-2 py-1 rounded text-[12px]"
                  style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`step-text-${index}`}
                />
                <input
                  type="number"
                  value={(step as { delay?: number }).delay ?? 50}
                  onChange={(e) =>
                    updateStepField(index, "delay", Number(e.target.value))
                  }
                  placeholder="Delay"
                  className="w-20 px-2 py-1 rounded text-[12px]"
                  style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`step-delay-${index}`}
                />
              </>
            )}
            {step.action === "keypress" && (
              <input
                type="text"
                value={(step as { key: string }).key}
                onChange={(e) => updateStepField(index, "key", e.target.value)}
                placeholder="Key name"
                className="w-32 px-2 py-1 rounded text-[12px]"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`step-key-${index}`}
              />
            )}
            {step.action === "click" && (
              <>
                <input
                  type="number"
                  value={(step as { x: number }).x}
                  onChange={(e) =>
                    updateStepField(index, "x", Number(e.target.value))
                  }
                  placeholder="X"
                  className="w-20 px-2 py-1 rounded text-[12px]"
                  style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`step-x-${index}`}
                />
                <input
                  type="number"
                  value={(step as { y: number }).y}
                  onChange={(e) =>
                    updateStepField(index, "y", Number(e.target.value))
                  }
                  placeholder="Y"
                  className="w-20 px-2 py-1 rounded text-[12px]"
                  style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`step-y-${index}`}
                />
              </>
            )}
            {step.action === "launch" && (
              <input
                type="text"
                value={(step as { target: string }).target}
                onChange={(e) =>
                  updateStepField(index, "target", e.target.value)
                }
                placeholder="Target program"
                className="flex-1 px-2 py-1 rounded text-[12px]"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`step-target-${index}`}
              />
            )}
            {step.action === "scroll" && (
              <input
                type="number"
                value={(step as { delta: number }).delta}
                onChange={(e) =>
                  updateStepField(index, "delta", Number(e.target.value))
                }
                placeholder="Delta"
                className="w-24 px-2 py-1 rounded text-[12px]"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`step-delta-${index}`}
              />
            )}

            <button
              type="button"
              onClick={() => removeStep(index)}
              className="text-[12px]"
              style={{ color: "var(--color-danger)" }}
              data-testid={`step-remove-${index}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          data-testid="script-save"
        >
          {script ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-surface-alt)", color: "var(--color-text)" }}
          data-testid="script-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default ScriptForm;
