import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AutomationContribution, AutomationContributionGroup, Script, StreamDeckIcon } from "../types";
import { findContribution, insertContributionAfter, moveContributionToGroup, moveContributionWithinGroup, moveGroup } from "../utils/contributionOrder";
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
type DragKind = "group" | "contribution";
const GROUP_DROP_SUFFIX = ":drop";

/**
 * Steps vary in height, and the default sortable getter bottom-aligns a step dragged downward, so a tall
 * step's center can stay closest to its own slot. Center the dragged step on the neighboring step instead.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, collisionRect, droppableRects, droppableContainers } = args.context;
  const direction = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
  if (!direction || !active || !collisionRect || active.data.current?.kind !== "group") {
    return sortableKeyboardCoordinates(event, args);
  }
  event.preventDefault();
  const center = collisionRect.top + collisionRect.height / 2;
  let targetCenter: number | null = null;
  for (const container of droppableContainers.getEnabled()) {
    if (container.data.current?.kind !== "group") continue;
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const candidate = rect.top + rect.height / 2;
    if ((candidate - center) * direction < 1) continue;
    if (targetCenter === null || Math.abs(candidate - center) < Math.abs(targetCenter - center)) targetCenter = candidate;
  }
  return targetCenter === null ? undefined : { x: collisionRect.left, y: targetCenter - collisionRect.height / 2 };
};

function newOpenSiteContribution(): AutomationContribution {
  return { id: crypto.randomUUID(), kind: "openSite", title: "Open site", url: "https://" };
}

interface ContributionRowProps {
  contribution: AutomationContribution;
  groupIndex: number;
  contributionIndex: number;
  isLast: boolean;
  dragKind: DragKind | null;
  controlRef: (contributionId: string, control: ContributionControl) => (element: HTMLElement | null) => void;
  onChange: (field: "title" | "url", value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onInsertBelow: () => void;
  onRemove: () => void;
}

const inputStyle = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" };

function SortableContributionRow({ contribution, groupIndex, contributionIndex, isLast, dragKind, controlRef, onChange, onMove, onInsertBelow, onRemove }: ContributionRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: contribution.id,
    data: { kind: "contribution" },
    // Rows are not drop targets while a whole step is being dragged.
    disabled: { draggable: false, droppable: dragKind === "group" },
  });
  const stepLabel = `${groupIndex + 1}.${contributionIndex + 1}`;
  const actionName = contribution.title?.trim() || contribution.url || `action ${stepLabel}`;
  const testSuffix = `${groupIndex}-${contributionIndex}`;

  return (
    <div
      ref={setNodeRef}
      className="grid grid-cols-[auto_auto_1fr_2fr_auto] items-center gap-2 mb-2"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative", zIndex: isDragging ? 1 : undefined }}
      data-testid={`contribution-${testSuffix}`}
      data-contribution-id={contribution.id}
    >
      {/* Drag listeners live only on this handle so the inputs keep normal text editing and selection. */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        className="p-1 rounded cursor-grab active:cursor-grabbing touch-none"
        style={{ color: "var(--color-text-secondary)" }}
        aria-label={`Drag to reorder ${actionName}`}
        title="Drag to reorder"
        data-testid={`drag-contribution-${testSuffix}`}
      >
        <GripVertical size={14} />
      </button>
      <span className="text-sm font-mono tabular-nums min-w-[2.5rem]" style={{ color: "var(--color-text-secondary)" }} aria-hidden="true" data-testid={`contribution-number-${testSuffix}`}>
        {stepLabel}
      </span>
      <input
        type="text"
        value={contribution.title ?? ""}
        onChange={(e) => onChange("title", e.target.value)}
        placeholder="Title"
        className="px-2 py-1 rounded text-base"
        style={inputStyle}
        aria-label={`Action ${stepLabel} title`}
        data-testid={`contribution-title-${testSuffix}`}
      />
      <input
        ref={controlRef(contribution.id, "url")}
        type="url"
        value={contribution.url}
        onChange={(e) => onChange("url", e.target.value)}
        placeholder="https://example.com"
        className="px-2 py-1 rounded text-base"
        style={inputStyle}
        aria-label={`Action ${stepLabel} URL`}
        data-testid={`contribution-url-${testSuffix}`}
      />
      <div className="flex items-center gap-1">
        <button
          ref={controlRef(contribution.id, "up")}
          type="button"
          onClick={() => onMove(-1)}
          disabled={contributionIndex === 0}
          className="p-1 rounded disabled:opacity-30"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={`Move ${actionName} up`}
          title="Move up"
          data-testid={`move-contribution-up-${testSuffix}`}
        >
          <ArrowUp size={14} />
        </button>
        <button
          ref={controlRef(contribution.id, "down")}
          type="button"
          onClick={() => onMove(1)}
          disabled={isLast}
          className="p-1 rounded disabled:opacity-30"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={`Move ${actionName} down`}
          title="Move down"
          data-testid={`move-contribution-down-${testSuffix}`}
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          onClick={onInsertBelow}
          className="p-1 rounded"
          style={{ color: "var(--color-accent)" }}
          aria-label={`Insert action below ${actionName}`}
          title="Insert below"
          data-testid={`insert-contribution-below-${testSuffix}`}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded"
          style={{ color: "var(--color-danger)" }}
          aria-label={`Remove ${actionName}`}
          title="Remove"
          data-testid={`remove-contribution-${testSuffix}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

interface SortableGroupProps {
  group: AutomationContributionGroup;
  groupIndex: number;
  groupCount: number;
  dragKind: DragKind | null;
  controlRef: (id: string, control: ContributionControl) => (element: HTMLElement | null) => void;
  onTitleChange: (value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onAddAction: () => void;
  onRemove: () => void;
  children: ReactNode;
}

function SortableGroup({ group, groupIndex, groupCount, dragKind, controlRef, onTitleChange, onMove, onAddAction, onRemove, children }: SortableGroupProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    data: { kind: "group" },
    // Steps only act as drop targets for other steps, so actions land on rows or empty-step zones.
    disabled: { draggable: false, droppable: dragKind === "contribution" },
  });
  const isEmpty = group.contributions.length === 0;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${group.id}${GROUP_DROP_SUFFIX}`,
    data: { kind: "groupDrop", groupId: group.id },
    disabled: !isEmpty || dragKind === "group",
  });
  const stepName = group.title.trim() || `step ${groupIndex + 1}`;

  return (
    <div
      ref={setNodeRef}
      className="mb-3 p-3 rounded"
      style={{
        backgroundColor: "var(--color-surface-inset)",
        border: "1px solid var(--color-border-subtle)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
      }}
      data-testid={`contribution-group-${groupIndex}`}
      data-group-id={group.id}
    >
      <div className="flex items-center gap-2 mb-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 rounded cursor-grab active:cursor-grabbing touch-none"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={`Drag to reorder ${stepName}`}
          title="Drag to reorder step"
          data-testid={`drag-group-${groupIndex}`}
        >
          <GripVertical size={14} />
        </button>
        <span className="text-sm font-mono tabular-nums" style={{ color: "var(--color-text-secondary)" }} aria-hidden="true" data-testid={`contribution-group-number-${groupIndex}`}>
          {groupIndex + 1}
        </span>
        <input
          type="text"
          value={group.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="flex-1 px-2 py-1 rounded text-base"
          style={inputStyle}
          aria-label={`Step ${groupIndex + 1} name`}
          data-testid={`contribution-group-title-${groupIndex}`}
        />
        <button
          ref={controlRef(group.id, "up")}
          type="button"
          onClick={() => onMove(-1)}
          disabled={groupIndex === 0}
          className="p-1 rounded disabled:opacity-30"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={`Move ${stepName} up`}
          title="Move step up"
          data-testid={`move-group-up-${groupIndex}`}
        >
          <ArrowUp size={14} />
        </button>
        <button
          ref={controlRef(group.id, "down")}
          type="button"
          onClick={() => onMove(1)}
          disabled={groupIndex === groupCount - 1}
          className="p-1 rounded disabled:opacity-30"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={`Move ${stepName} down`}
          title="Move step down"
          data-testid={`move-group-down-${groupIndex}`}
        >
          <ArrowDown size={14} />
        </button>
        <button type="button" onClick={onAddAction} className="text-base font-medium" style={{ color: "var(--color-accent)" }} title="Add an Open site action" data-testid={`add-open-site-${groupIndex}`}>
          + Add action
        </button>
        <button type="button" onClick={onRemove} className="text-base" style={{ color: "var(--color-danger)" }} data-testid={`remove-contribution-group-${groupIndex}`}>
          Remove
        </button>
      </div>
      {children}
      {isEmpty && (
        <div
          ref={setDropRef}
          className="px-3 py-2 rounded text-sm"
          style={{
            border: `1px dashed ${isOver ? "var(--color-accent)" : "var(--color-border)"}`,
            color: "var(--color-text-secondary)",
          }}
          data-testid={`contribution-group-drop-${groupIndex}`}
        >
          No actions yet. Add one, or drag an action here.
        </div>
      )}
    </div>
  );
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  const dragSnapshot = useRef<AutomationContributionGroup[] | null>(null);

  const moveContributionGroup = (groupId: string, fromIndex: number, direction: -1 | 1, count: number) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= count) return;
    setContributionGroups((groups) => moveGroup(groups, groupId, toIndex));
    const atEdge = direction === -1 ? toIndex === 0 : toIndex === count - 1;
    const control: ContributionControl = direction === -1 ? (atEdge ? "down" : "up") : (atEdge ? "up" : "down");
    setPendingFocus({ contributionId: groupId, control });
  };

  const kindOf = (data: { current?: Record<string, unknown> } | undefined) => data?.current?.kind as string | undefined;

  const handleDragStart = ({ active }: DragStartEvent) => {
    dragSnapshot.current = contributionGroups;
    setDragKind(kindOf(active.data) === "group" ? "group" : "contribution");
  };

  // Moves an action into another step while it is dragged, so it can be dropped anywhere in that step.
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || kindOf(active.data) !== "contribution") return;
    const activeId = String(active.id);
    setContributionGroups((groups) => {
      const from = findContribution(groups, activeId);
      if (!from) return groups;
      if (kindOf(over.data) === "groupDrop") {
        const targetGroupId = String(over.data.current?.groupId);
        return targetGroupId === from.groupId ? groups : moveContributionToGroup(groups, activeId, targetGroupId, 0);
      }
      const to = findContribution(groups, String(over.id));
      if (!to || to.groupId === from.groupId) return groups;
      // Take the hovered row's slot; the keyboard sensor snaps to that row, so the drop then lands in place.
      return moveContributionToGroup(groups, activeId, to.groupId, to.index);
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragKind(null);
    dragSnapshot.current = null;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    if (kindOf(active.data) === "group") {
      setContributionGroups((groups) => {
        const toIndex = groups.findIndex((group) => group.id === String(over.id));
        return toIndex < 0 ? groups : moveGroup(groups, activeId, toIndex);
      });
      return;
    }
    setContributionGroups((groups) => {
      const from = findContribution(groups, activeId);
      if (!from) return groups;
      if (kindOf(over.data) === "groupDrop") {
        return moveContributionToGroup(groups, activeId, String(over.data.current?.groupId), Number.MAX_SAFE_INTEGER);
      }
      const to = findContribution(groups, String(over.id));
      if (!to) return groups;
      return moveContributionToGroup(groups, activeId, to.groupId, to.index);
    });
  };

  const handleDragCancel = () => {
    if (dragSnapshot.current) setContributionGroups(dragSnapshot.current);
    dragSnapshot.current = null;
    setDragKind(null);
  };

  const describeDragItem = (id: UniqueIdentifier) => {
    const key = String(id);
    const groupId = key.endsWith(GROUP_DROP_SUFFIX) ? key.slice(0, -GROUP_DROP_SUFFIX.length) : key;
    const groupIndex = contributionGroups.findIndex((group) => group.id === groupId);
    if (groupIndex >= 0) {
      const name = contributionGroups[groupIndex].title.trim() || `step ${groupIndex + 1}`;
      return key === groupId ? `step ${groupIndex + 1}, ${name}` : `empty step ${groupIndex + 1}, ${name}`;
    }
    const found = findContribution(contributionGroups, key);
    if (!found) return "item";
    const group = contributionGroups.find((candidate) => candidate.id === found.groupId)!;
    const contribution = group.contributions[found.index];
    return `action ${contributionGroups.indexOf(group) + 1}.${found.index + 1}, ${contribution.title?.trim() || contribution.url}`;
  };

  // Describes where a drop lands; state hasn't committed yet, so name the destination rather than the moved item's old slot.
  const describeDrop = (activeId: UniqueIdentifier, overId: UniqueIdentifier) => {
    const item = describeDragItem(activeId);
    const key = String(overId);
    if (key.endsWith(GROUP_DROP_SUFFIX)) {
      const groupIndex = contributionGroups.findIndex((group) => group.id === key.slice(0, -GROUP_DROP_SUFFIX.length));
      return `Dropped ${item} into step ${groupIndex + 1}.`;
    }
    const groupIndex = contributionGroups.findIndex((group) => group.id === key);
    if (groupIndex >= 0) return `Dropped ${item} at step position ${groupIndex + 1}.`;
    const found = findContribution(contributionGroups, key);
    if (!found) return `Dropped ${item}.`;
    const stepNumber = contributionGroups.findIndex((group) => group.id === found.groupId) + 1;
    return `Dropped ${item} at position ${stepNumber}.${found.index + 1}.`;
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describeDragItem(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `${describeDragItem(active.id)} is over ${describeDragItem(over.id)}.` : `${describeDragItem(active.id)} is no longer over a drop target.`,
    onDragEnd: ({ active, over }) => {
      if (!over) return `Dropped ${describeDragItem(active.id)} in place.`;
      // After a cross-step move the item is over itself, and its description already reflects the new slot.
      return over.id === active.id ? `Dropped ${describeDragItem(active.id)}.` : describeDrop(active.id, over.id);
    },
    onDragCancel: ({ active }) => `Cancelled moving ${describeDragItem(active.id)}.`,
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
        {contributionGroups.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{ announcements }}
        >
        <SortableContext items={contributionGroups.map((group) => group.id)} strategy={verticalListSortingStrategy}>
        {contributionGroups.map((group, groupIndex) => (
          <SortableGroup
            key={group.id}
            group={group}
            groupIndex={groupIndex}
            groupCount={contributionGroups.length}
            dragKind={dragKind}
            controlRef={controlRef}
            onTitleChange={(value) => updateContributionGroupTitle(group.id, value)}
            onMove={(direction) => moveContributionGroup(group.id, groupIndex, direction, contributionGroups.length)}
            onAddAction={() => addOpenSiteContribution(group.id)}
            onRemove={() => removeContributionGroup(group.id)}
          >
            <SortableContext items={group.contributions.map((contribution) => contribution.id)} strategy={verticalListSortingStrategy}>
              {group.contributions.map((contribution, contributionIndex) => (
                <SortableContributionRow
                  key={contribution.id}
                  contribution={contribution}
                  groupIndex={groupIndex}
                  contributionIndex={contributionIndex}
                  isLast={contributionIndex === group.contributions.length - 1}
                  dragKind={dragKind}
                  controlRef={controlRef}
                  onChange={(field, value) => updateOpenSiteContribution(group.id, contribution.id, field, value)}
                  onMove={(direction) => moveContribution(group.id, contribution.id, contributionIndex, direction, group.contributions.length)}
                  onInsertBelow={() => insertOpenSiteContributionBelow(group.id, contribution.id)}
                  onRemove={() => removeContribution(group.id, contribution.id)}
                />
              ))}
            </SortableContext>
          </SortableGroup>
        ))}
        </SortableContext>
        </DndContext>
        )}
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
