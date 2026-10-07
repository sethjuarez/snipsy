import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import type { AutomationContributionGroup, Script, ScriptStep } from "../types";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";

interface ScriptFormProps {
  script?: Script;
  onSave: (script: Script) => void;
  hotkeyOwners?: HotkeyOwner[];
  onSaveStateChange?: (state: { canSave: boolean; readinessText: string; saveStatus: "idle" | "unsaved" | "saved" }) => void;
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
    case "move":
      return { action: "move", x: 0, y: 0 };
    default:
      return EMPTY_STEP;
  }
}

function defaultContributionGroups(script?: Script): AutomationContributionGroup[] {
  return script?.contributionGroups ?? [];
}

function ScriptForm({ script, onSave, hotkeyOwners = [], onSaveStateChange }: ScriptFormProps) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [description, setDescription] = useState(script?.description ?? "");
  const [hotkey, setHotkey] = useState(script?.hotkey ?? "");
  const [outputVideo, setOutputVideo] = useState(
    script?.outputVideo ?? "",
  );
  const [steps, setSteps] = useState<ScriptStep[]>(script?.steps ?? []);
  const [contributionGroups, setContributionGroups] = useState<AutomationContributionGroup[]>(() => defaultContributionGroups(script));
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saved">("idle");
  const coordinateStepCount = steps.filter((step) =>
    step.action === "click" || step.action === "move" || (step.action === "scroll" && (step.x !== undefined || step.y !== undefined)),
  ).length;
  const hotkeyStatus = hotkey.trim() ? validateHotkey(hotkey, hotkeyOwners, script?.id) : { state: "available" as const, message: "Optional. Capture a hotkey to run this automation in demo mode." };
  const canSave = Boolean(title.trim()) && hotkeyStatus.state === "available";
  const readinessText = canSave
    ? "Ready"
    : `Needs ${[
      !title.trim() ? "Name" : null,
      hotkeyStatus.state !== "available" ? "Hotkey" : null,
    ].filter(Boolean).join(", ")}`;

  const addStep = () => {
    setSteps([...steps, structuredClone(EMPTY_STEP)]);
  };

  const addContributionGroup = () => {
    setContributionGroups([
      ...contributionGroups,
      { id: crypto.randomUUID(), title: `Group ${contributionGroups.length + 1}`, contributions: [] },
    ]);
  };

  const removeContributionGroup = (groupId: string) => {
    setContributionGroups(contributionGroups.filter((group) => group.id !== groupId));
  };

  const updateContributionGroupTitle = (groupId: string, value: string) => {
    setContributionGroups(contributionGroups.map((group) => group.id === groupId ? { ...group, title: value } : group));
  };

  const addOpenSiteContribution = (groupId: string) => {
    setContributionGroups(contributionGroups.map((group) => group.id === groupId
      ? {
        ...group,
        contributions: [
          ...group.contributions,
          { id: crypto.randomUUID(), kind: "openSite", title: "Open site", url: "https://" },
        ],
      }
      : group));
  };

  const removeContribution = (groupId: string, contributionId: string) => {
    setContributionGroups(contributionGroups.map((group) => group.id === groupId
      ? { ...group, contributions: group.contributions.filter((contribution) => contribution.id !== contributionId) }
      : group));
  };

  const updateOpenSiteContribution = (groupId: string, contributionId: string, field: "title" | "url" | "idempotencyKey", value: string) => {
    setContributionGroups(contributionGroups.map((group) => group.id === groupId
      ? {
        ...group,
        contributions: group.contributions.map((contribution) => contribution.id === contributionId && contribution.kind === "openSite"
          ? { ...contribution, [field]: value }
          : contribution),
      }
      : group));
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
    if (!canSave) return;

    onSave({
      id: script?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      hotkey: hotkey.trim() || undefined,
      steps,
      contributionGroups,
      outputVideo: outputVideo.trim() || undefined,
      platform: script?.platform,
      startScreenshot: script?.startScreenshot,
      recordedAt: script?.recordedAt,
      streamDeckIcon: script?.streamDeckIcon,
    });
    setSaveStatus("saved");
  };

  useEffect(() => {
    if (saveStatus === "saved") setSaveStatus("unsaved");
  }, [title, description, hotkey, outputVideo, steps, contributionGroups]);

  const handleHotkeyCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = formatKeyCombo(e.nativeEvent);
    if (combo.includes("+") && !combo.endsWith("+")) {
      setHotkey(combo);
      setCapturingHotkey(false);
    }
  };

  useEffect(() => {
    onSaveStateChange?.({ canSave, readinessText: saveStatus === "saved" ? "Saved" : readinessText, saveStatus });
  }, [canSave, onSaveStateChange, readinessText, saveStatus]);

  return (
    <form
      onSubmit={handleSubmit}
      id="automation-editor-form"
      className="space-y-4"
      data-testid="automation-form"
    >
      {script?.platform && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }} data-testid="automation-platform-badge">
            <Monitor size={10} />
            {script.platform}
          </span>
          {script.recordedAt && (
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Recorded {new Date(script.recordedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="automation-title" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
            Name
          </label>
          <input
            id="automation-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Automation name"
            required
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="automation-title"
          />
        </div>
        <div>
          <label htmlFor="automation-hotkey" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
            Hotkey
          </label>
          <input
            id="automation-hotkey"
            type="text"
            value={capturingHotkey ? "Press a key combo..." : hotkey}
            readOnly
            onFocus={() => setCapturingHotkey(true)}
            onBlur={() => setCapturingHotkey(false)}
            onKeyDown={handleHotkeyCapture}
            placeholder="Optional hotkey"
            className="w-full px-3 py-2 rounded font-mono text-md"
            style={capturingHotkey
              ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
              : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="automation-hotkey"
            aria-describedby="automation-hotkey-status"
          />
          <p id="automation-hotkey-status" className="mt-1 text-sm" style={{ color: hotkeyStatus.state === "available" ? "var(--color-text-secondary)" : "var(--color-danger)" }} data-testid="automation-hotkey-status">
            {hotkeyStatus.message}
          </p>
        </div>
        <div>
          <label htmlFor="automation-output" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
            Recording Output
          </label>
          <input
            id="automation-output"
            type="text"
            value={outputVideo}
            onChange={(e) => setOutputVideo(e.target.value)}
            placeholder="Optional video output"
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="automation-output"
          />
        </div>
      </div>

      <div>
        <label htmlFor="automation-description" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Description
        </label>
        <input
          id="automation-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 rounded text-md"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="automation-description"
        />
      </div>

      <div
        className="grid grid-cols-3 gap-2 rounded-lg p-3"
        style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border-subtle)" }}
        data-testid="automation-builder-summary"
      >
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Workflow</div>
          <div className="text-base" style={{ color: "var(--color-text)" }}>
            {contributionGroups.reduce((sum, group) => sum + group.contributions.length, 0)} contribution{contributionGroups.reduce((sum, group) => sum + group.contributions.length, 0) === 1 ? "" : "s"}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Portability</div>
          <div className="text-base" style={{ color: coordinateStepCount > 0 ? "var(--color-warning)" : "var(--color-success)" }}>
            {coordinateStepCount > 0 ? `${coordinateStepCount} coordinate step${coordinateStepCount === 1 ? "" : "s"}` : "Portable"}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Recording</div>
          <div className="text-base" style={{ color: "var(--color-text)" }}>
            Optional run artifact
          </div>
        </div>
      </div>

      <div data-testid="automation-contributions-section">
        <div className="flex items-center justify-between mb-2">
          <label className="block font-medium text-base" style={{ color: "var(--color-text-secondary)" }}>
            Contribution Groups
          </label>
          <button
            type="button"
            onClick={addContributionGroup}
            className="text-base font-medium"
            style={{ color: "var(--color-accent)" }}
            data-testid="add-contribution-group"
          >
            + Add Group
          </button>
        </div>
        {contributionGroups.length === 0 && (
          <p className="text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="no-contributions">
            No contribution groups yet. Add a group, then add ordered contributions.
          </p>
        )}
        {contributionGroups.map((group, groupIndex) => (
          <div key={group.id} className="mb-3 p-3 rounded" style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border-subtle)" }} data-testid={`contribution-group-${groupIndex}`}>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={group.title}
                onChange={(e) => updateContributionGroupTitle(group.id, e.target.value)}
                className="flex-1 px-2 py-1 rounded text-base"
                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`contribution-group-title-${groupIndex}`}
              />
              <button type="button" onClick={() => addOpenSiteContribution(group.id)} className="text-base font-medium" style={{ color: "var(--color-accent)" }} data-testid={`add-open-site-${groupIndex}`}>
                + Open Site
              </button>
              <button type="button" onClick={() => removeContributionGroup(group.id)} className="text-base" style={{ color: "var(--color-danger)" }} data-testid={`remove-contribution-group-${groupIndex}`}>
                Remove
              </button>
            </div>
            {group.contributions.map((contribution, contributionIndex) => (
              <div key={contribution.id} className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 mb-2" data-testid={`contribution-${groupIndex}-${contributionIndex}`}>
                <input
                  type="text"
                  value={contribution.title ?? ""}
                  onChange={(e) => updateOpenSiteContribution(group.id, contribution.id, "title", e.target.value)}
                  placeholder="Title"
                  className="px-2 py-1 rounded text-base"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`contribution-title-${groupIndex}-${contributionIndex}`}
                />
                <input
                  type="url"
                  value={contribution.url}
                  onChange={(e) => updateOpenSiteContribution(group.id, contribution.id, "url", e.target.value)}
                  placeholder="https://example.com"
                  className="px-2 py-1 rounded text-base"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`contribution-url-${groupIndex}-${contributionIndex}`}
                />
                <input
                  type="text"
                  value={contribution.idempotencyKey ?? ""}
                  onChange={(e) => updateOpenSiteContribution(group.id, contribution.id, "idempotencyKey", e.target.value)}
                  placeholder="Idempotency key"
                  className="px-2 py-1 rounded text-base"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  data-testid={`contribution-idempotency-${groupIndex}-${contributionIndex}`}
                />
                <button type="button" onClick={() => removeContribution(group.id, contribution.id)} className="text-base" style={{ color: "var(--color-danger)" }} data-testid={`remove-contribution-${groupIndex}-${contributionIndex}`}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div data-testid="automation-steps-section">
        <div className="flex items-center justify-between mb-2">
          <label className="block font-medium text-base" style={{ color: "var(--color-text-secondary)" }}>
            Recording Steps
          </label>
          <button
            type="button"
            onClick={addStep}
            className="text-base font-medium"
            style={{ color: "var(--color-accent)" }}
            data-testid="add-step"
          >
            + Add Step
          </button>
        </div>
        {steps.length === 0 && (
          <p className="text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="no-steps">
            No steps yet. Add steps to define the automation.
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
              className="px-2 py-1 rounded text-base"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`step-action-${index}`}
            >
              <option value="wait">Wait</option>
              <option value="type">Type</option>
              <option value="keypress">Keypress</option>
              <option value="click">Click</option>
              <option value="launch">Launch</option>
              <option value="scroll">Scroll</option>
              <option value="move">Move Pointer</option>
            </select>

            {step.action === "wait" && (
              <input
                type="number"
                value={(step as { duration: number }).duration}
                onChange={(e) =>
                  updateStepField(index, "duration", Number(e.target.value))
                }
                placeholder="ms"
                className="w-24 px-2 py-1 rounded text-base"
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
                  className="flex-1 px-2 py-1 rounded text-base"
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
                  className="w-20 px-2 py-1 rounded text-base"
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
                className="w-32 px-2 py-1 rounded text-base"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`step-key-${index}`}
              />
            )}
            {(step.action === "click" || step.action === "move") && (
              <>
                <input
                  type="number"
                  value={(step as { x: number }).x}
                  onChange={(e) =>
                    updateStepField(index, "x", Number(e.target.value))
                  }
                  placeholder="X"
                  className="w-20 px-2 py-1 rounded text-base"
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
                  className="w-20 px-2 py-1 rounded text-base"
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
                className="flex-1 px-2 py-1 rounded text-base"
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
                className="w-24 px-2 py-1 rounded text-base"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid={`step-delta-${index}`}
              />
            )}

            <button
              type="button"
              onClick={() => removeStep(index)}
              className="text-base"
              style={{ color: "var(--color-danger)" }}
              data-testid={`step-remove-${index}`}
              aria-label={`Remove step ${index + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

    </form>
  );
}

export default ScriptForm;
