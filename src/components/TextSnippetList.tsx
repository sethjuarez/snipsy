import { AlertTriangle, Copy, Pencil, Plus, Trash2, Keyboard, Clipboard, GripVertical } from "lucide-react";
import EmptyState from "./EmptyState";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TextSnippet } from "../types";
import { hotkeyProblem, type HotkeyOwner } from "../utils/hotkeys";
import Button from "./ui/Button";
import Kbd from "./ui/Kbd";
import ListRow from "./ui/ListRow";
import StatusBadge from "./ui/StatusBadge";
import type { MenuItem } from "./ui/Menu";

interface TextSnippetListProps {
  snippets: TextSnippet[];
  onEdit: (snippet: TextSnippet) => void;
  onDelete: (id: string) => void;
  onReorder: (snippets: TextSnippet[]) => void;
  onDuplicate?: (snippet: TextSnippet) => void;
  onAdd?: () => void;
  hotkeyOwners?: HotkeyOwner[];
}

interface ItemProps {
  snippet: TextSnippet;
  onEdit: (snippet: TextSnippet) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (snippet: TextSnippet) => void;
  hotkeyOwners?: HotkeyOwner[];
}

function SortableSnippetItem({ snippet, onEdit, onDelete, onDuplicate, hotkeyOwners }: ItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: snippet.id });

  const problem = hotkeyOwners ? hotkeyProblem(snippet.hotkey, hotkeyOwners, snippet.id) : null;
  const menuItems: MenuItem[] = [
    { id: "edit", label: "Edit", icon: <Pencil size={12} />, onSelect: () => onEdit(snippet) },
    ...(onDuplicate ? [{ id: "duplicate", label: "Duplicate", icon: <Copy size={12} />, onSelect: () => onDuplicate(snippet) }] : []),
    { id: "delete", label: "Delete", icon: <Trash2 size={12} />, onSelect: () => onDelete(snippet.id), danger: true, separated: true },
  ];

  return (
    <ListRow
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      menuItems={menuItems}
      menuLabel={`More actions for ${snippet.title}`}
      data-testid={`snippet-${snippet.id}`}
      leading={
        <div
          {...attributes}
          {...listeners}
          className="flex items-center cursor-grab active:cursor-grabbing touch-none"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={`Reorder ${snippet.title}`}
          data-testid={`drag-handle-${snippet.id}`}
        >
          <GripVertical size={14} />
        </div>
      }
      actions={
        <>
          <Button tone="ghost" icon={<Pencil size={12} />} onClick={() => onEdit(snippet)} title="Edit text snippet" data-testid={`edit-${snippet.id}`}>
            Edit
          </Button>
          <Button tone="danger" icon={<Trash2 size={12} />} onClick={() => onDelete(snippet.id)} title="Delete text snippet" data-testid={`delete-${snippet.id}`}>
            Delete
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
          {snippet.title}
        </h3>
        <Kbd hotkey={snippet.hotkey} />
        <StatusBadge tone={snippet.delivery === "fast-type" ? "accent" : "success"} icon={snippet.delivery === "fast-type" ? <Keyboard size={10} /> : <Clipboard size={10} />}>
          {snippet.delivery === "fast-type" ? "fast-type" : "paste"}
        </StatusBadge>
        {problem && (
          <StatusBadge tone={problem.tone} icon={<AlertTriangle size={10} />} title={problem.detail} data-testid={`snippet-status-${snippet.id}`}>
            {problem.label}
          </StatusBadge>
        )}
      </div>
      {snippet.description && (
        <p className="text-base mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
          {snippet.description}
        </p>
      )}
    </ListRow>
  );
}
function TextSnippetList({ snippets, onEdit, onDelete, onReorder, onDuplicate, onAdd, hotkeyOwners }: TextSnippetListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (snippets.length === 0) {
    return (
      <EmptyState
        icon={Keyboard}
        title="No text snippets yet"
        description="Text snippets type or paste prepared text when you press their hotkey."
        action={onAdd ? { label: "Add text snippet", icon: <Plus size={12} />, onClick: onAdd, testId: "empty-add-snippet" } : undefined}
        tip="Tip: use fast-type for code so the audience sees it being typed."
        data-testid="empty-state"
      />
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = snippets.findIndex((s) => s.id === active.id);
      const newIndex = snippets.findIndex((s) => s.id === over.id);
      onReorder(arrayMove(snippets, oldIndex, newIndex));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={snippets.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2" data-testid="text-snippet-list">
          {snippets.map((snippet) => (
            <SortableSnippetItem
              key={snippet.id}
              snippet={snippet}
              onEdit={onEdit}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              hotkeyOwners={hotkeyOwners}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default TextSnippetList;
