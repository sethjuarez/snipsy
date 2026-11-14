import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { AutomationContribution, AutomationContributionGroup, Script, StreamDeckIcon } from "../types";
import { insertContributionAfter, moveContributionWithinGroup } from "../utils/contributionOrder";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";
import { defaultStreamDeckIcon } from "../utils/streamDeckIcons";
import { useSaveTracking, type EditorSaveState } from "../hooks/useSaveTracking";
import IconEditor from "./IconEditor";

interface ScriptFormProps {
  script?: Script;
  onSave: (script: Script) => Promise<void> | void;
  hotkeyOwners?: HotkeyOwner[];
  onSaveStateChange?: (state: EditorSaveState) => void;
}

function defaultContributionGroups(script?: Script): AutomationContributionGroup[] {
  return script?.contributionGroups ?? [];
}

type ContributionControl = "up" | "down" | "url";

function newOpenSiteContribution(): AutomationContribution {
  return { id: crypto.randomUUID(), kind: "openSite", title: "Open site", url: "https://" };
}

function ScriptForm({ script, onSave, hotkeyOwners = [], onSaveStateChange }: ScriptFormProps) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [description, setDescription] = useState(script?.description ?? "");
  const [hotkey, setHotkey] = useState(script?.hotkey ?? "");
  const [contributionGroups, setContributionGroups] = useState<AutomationContributionGroup[]>(() => defaultContributionGroups(script));
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [streamDeckIcon, setStreamDeckIcon] = useState<StreamDeckIcon>(script?.streamDeckIcon ?? defaultStreamDeckIcon("automation"));
  const { saveStatus, hasUnsavedChanges, runSave } = useSaveTracking({
    title: title.trim(),
    description: description.trim(),
    hotkey: hotkey.trim(),
    contributionGroups,
    streamDeckIcon,
  });
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
      { id: crypto.randomUUID(), title: `Step ${contributionGroups.length + 1}`, contributions: [] },
    ]);
  };

  const removeContributionGroup = (groupId: string) => {
    setContributionGroups(contributionGroups.filter((group) => group.id !== groupId));
  };

  const updateContributionGroupTitle = (groupId: string, value: string) => {
    setContributionGroups(contributionGroups.map((group) => group.id === groupId ? { ...group, title: value } : group));
  };

  const controlRefs = useRef(new Map<string, HTMLElement>());
  const [pendingFocus, setPendingFocus] = useState<{ contributionId: string; control: ContributionControl } | null>(null);
  const controlRef = (contributionId: string, control: ContributionControl) => (element: HTMLElement | null) => {
    const key = `${contributionId}:${control}`;
    if (element) controlRefs.current.set(key, element);
    else controlRefs.current.delete(key);
  };

  useEffect(() => {
    if (!pendingFocus) return;
    controlRefs.current.get(`${pendingFocus.contributionId}:${pendingFocus.control}`)?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const addOpenSiteContribution = (groupId: string) => {
    const contribution = newOpenSiteContribution();
    setContributionGroups((groups) => groups.map((group) => group.id === groupId
      ? { ...group, contributions: [...group.contributions, contribution] }
      : group));
    setPendingFocus({ contributionId: contribution.id, control: "url" });
  };

  const insertOpenSiteContributionBelow = (groupId: string, afterContributionId: string) => {
    const contribution = newOpenSiteContribution();
    setContributionGroups((groups) => insertContributionAfter(groups, groupId, afterContributionId, contribution));
    setPendingFocus({ contributionId: contribution.id, control: "url" });
  };

  const moveContribution = (groupId: string, contributionId: string, fromIndex: number, direction: -1 | 1, count: number) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= count) return;
    setContributionGroups((groups) => moveContributionWithinGroup(groups, groupId, contributionId, toIndex));
    // Keep focus on the moved row; switch buttons when the one pressed becomes disabled at an edge.
    const atEdge = direction === -1 ? toIndex === 0 : toIndex === count - 1;
    const control: ContributionControl = direction === -1 ? (atEdge ? "down" : "up") : (atEdge ? "up" : "down");
    setPendingFocus({ contributionId, control });
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

  const saveScript = () => {
    if (!canSave) return;

    void runSave(() => onSave({
      id: script?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      hotkey: hotkey.trim() || undefined,
      contributionGroups,
      streamDeckIcon,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveScript();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s" || capturingHotkey) return;
      event.preventDefault();
      saveScript();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
    onSaveStateChange?.({ canSave, readinessText, saveStatus, hasUnsavedChanges });
  }, [canSave, onSaveStateChange, readinessText, saveStatus, hasUnsavedChanges]);

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
          <div>
            <label className="block font-medium text-base" style={{ color: "var(--color-text-secondary)" }}>
              Steps
            </label>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }} data-testid="automation-steps-help">
              Steps run in order. Actions inside a step run top to bottom.
            </p>
          </div>
          <button
            type="button"
            onClick={addContributionGroup}
            className="text-base font-medium"
            style={{ color: "var(--color-accent)" }}
            data-testid="add-contribution-group"
          >
            + Add step
          </button>
        </div>
        {contributionGroups.length === 0 && (
          <p className="text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="no-contributions">
            No steps yet. Add a step, then add the actions it should run.
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
                aria-label={`Step ${groupIndex + 1} name`}
                data-testid={`contribution-group-title-${groupIndex}`}
              />
              <button type="button" onClick={() => addOpenSiteContribution(group.id)} className="text-base font-medium" style={{ color: "var(--color-accent)" }} title="Add an Open site action" data-testid={`add-open-site-${groupIndex}`}>
                + Add action
              </button>
              <button type="button" onClick={() => removeContributionGroup(group.id)} className="text-base" style={{ color: "var(--color-danger)" }} data-testid={`remove-contribution-group-${groupIndex}`}>
                Remove
              </button>
            </div>
            {group.contributions.map((contribution, contributionIndex) => {
              const stepLabel = `${groupIndex + 1}.${contributionIndex + 1}`;
              const actionName = contribution.title?.trim() || contribution.url || `action ${stepLabel}`;
              const isFirst = contributionIndex === 0;
              const isLast = contributionIndex === group.contributions.length - 1;
              return (
              <div key={contribution.id} className="grid grid-cols-[auto_1fr_2fr_auto] items-center gap-2 mb-2" data-testid={`contribution-${groupIndex}-${contributionIndex}`} data-contribution-id={contribution.id}>
                <span className="text-sm font-mono tabular-nums min-w-[2.5rem]" style={{ color: "var(--color-text-secondary)" }} aria-hidden="true" data-testid={`contribution-number-${groupIndex}-${contributionIndex}`}>
                  {stepLabel}
                </span>
                <input
                  type="text"
                  value={contribution.title ?? ""}
                  onChange={(e) => updateOpenSiteContribution(group.id, contribution.id, "title", e.target.value)}
                  placeholder="Title"
                  className="px-2 py-1 rounded text-base"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  aria-label={`Action ${stepLabel} title`}
                  data-testid={`contribution-title-${groupIndex}-${contributionIndex}`}
                />
                <input
                  ref={controlRef(contribution.id, "url")}
                  type="url"
                  value={contribution.url}
                  onChange={(e) => updateOpenSiteContribution(group.id, contribution.id, "url", e.target.value)}
                  placeholder="https://example.com"
                  className="px-2 py-1 rounded text-base"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  aria-label={`Action ${stepLabel} URL`}
                  data-testid={`contribution-url-${groupIndex}-${contributionIndex}`}
                />
                <div className="flex items-center gap-1">
                  <button
                    ref={controlRef(contribution.id, "up")}
                    type="button"
                    onClick={() => moveContribution(group.id, contribution.id, contributionIndex, -1, group.contributions.length)}
                    disabled={isFirst}
                    className="p-1 rounded disabled:opacity-30"
                    style={{ color: "var(--color-text-secondary)" }}
                    aria-label={`Move ${actionName} up`}
                    title="Move up"
                    data-testid={`move-contribution-up-${groupIndex}-${contributionIndex}`}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    ref={controlRef(contribution.id, "down")}
                    type="button"
                    onClick={() => moveContribution(group.id, contribution.id, contributionIndex, 1, group.contributions.length)}
                    disabled={isLast}
                    className="p-1 rounded disabled:opacity-30"
                    style={{ color: "var(--color-text-secondary)" }}
                    aria-label={`Move ${actionName} down`}
                    title="Move down"
                    data-testid={`move-contribution-down-${groupIndex}-${contributionIndex}`}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertOpenSiteContributionBelow(group.id, contribution.id)}
                    className="p-1 rounded"
                    style={{ color: "var(--color-accent)" }}
                    aria-label={`Insert action below ${actionName}`}
                    title="Insert below"
                    data-testid={`insert-contribution-below-${groupIndex}-${contributionIndex}`}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeContribution(group.id, contribution.id)}
                    className="p-1 rounded"
                    style={{ color: "var(--color-danger)" }}
                    aria-label={`Remove ${actionName}`}
                    title="Remove"
                    data-testid={`remove-contribution-${groupIndex}-${contributionIndex}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        ))}
      </div>

      <IconEditor
        icon={streamDeckIcon}
        title={title || "Automation"}
        snippetType="automation"
        onChange={setStreamDeckIcon}
        testIdPrefix="automation-streamdeck-icon"
      />
    </form>
  );
}

export default ScriptForm;
