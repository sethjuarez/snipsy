import { useEffect, useState } from "react";
import type { AutomationContributionGroup, Script } from "../types";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";

interface ScriptFormProps {
  script?: Script;
  onSave: (script: Script) => void;
  hotkeyOwners?: HotkeyOwner[];
  onSaveStateChange?: (state: { canSave: boolean; readinessText: string; saveStatus: "idle" | "unsaved" | "saved" }) => void;
}

function defaultContributionGroups(script?: Script): AutomationContributionGroup[] {
  return script?.contributionGroups ?? [];
}

function ScriptForm({ script, onSave, hotkeyOwners = [], onSaveStateChange }: ScriptFormProps) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [description, setDescription] = useState(script?.description ?? "");
  const [hotkey, setHotkey] = useState(script?.hotkey ?? "");
  const [contributionGroups, setContributionGroups] = useState<AutomationContributionGroup[]>(() => defaultContributionGroups(script));
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saved">("idle");
  const hotkeyStatus = hotkey.trim() ? validateHotkey(hotkey, hotkeyOwners, script?.id) : { state: "available" as const, message: "Optional. Capture a hotkey to run this automation in demo mode." };
  const canSave = Boolean(title.trim()) && hotkeyStatus.state === "available";
  const readinessText = canSave
    ? "Ready"
    : `Needs ${[
      !title.trim() ? "Name" : null,
      hotkeyStatus.state !== "available" ? "Hotkey" : null,
    ].filter(Boolean).join(", ")}`;

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

  const updateOpenSiteContribution = (groupId: string, contributionId: string, field: "title" | "url", value: string) => {
    setContributionGroups(contributionGroups.map((group) => group.id === groupId
      ? {
        ...group,
        contributions: group.contributions.map((contribution) => contribution.id === contributionId && contribution.kind === "openSite"
          ? { ...contribution, [field]: value }
          : contribution),
      }
      : group));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    onSave({
      id: script?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      hotkey: hotkey.trim() || undefined,
      contributionGroups,
      streamDeckIcon: script?.streamDeckIcon,
    });
    setSaveStatus("saved");
  };

  useEffect(() => {
    if (saveStatus === "saved") setSaveStatus("unsaved");
  }, [title, description, hotkey, contributionGroups]);

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
      <div className="grid grid-cols-2 gap-4">
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
              <div key={contribution.id} className="grid grid-cols-[1fr_2fr_auto] gap-2 mb-2" data-testid={`contribution-${groupIndex}-${contributionIndex}`}>
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
                <button type="button" onClick={() => removeContribution(group.id, contribution.id)} className="text-base" style={{ color: "var(--color-danger)" }} data-testid={`remove-contribution-${groupIndex}-${contributionIndex}`}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

    </form>
  );
}

export default ScriptForm;
