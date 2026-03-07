import { Pencil, Trash2, Keyboard, Clipboard, GripVertical } from "lucide-react";
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

interface TextSnippetListProps {
  snippets: TextSnippet[];
  onEdit: (snippet: TextSnippet) => void;
  onDelete: (id: string) => void;
  onReorder: (snippets: TextSnippet[]) => void;
}

function SortableSnippetItem({
  snippet,
  onEdit,
  onDelete,
}: {
  snippet: TextSnippet;
  onEdit: (snippet: TextSnippet) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: snippet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: "var(--color-surface-alt)",
    border: "1px solid var(--color-border)",
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-lg px-4 py-3"
      data-testid={`snippet-${snippet.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center cursor-grab active:cursor-grabbing mr-2 touch-none"
        style={{ color: "var(--color-text-secondary)" }}
        data-testid={`drag-handle-${snippet.id}`}
      >
        <GripVertical size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <h3 className="font-medium truncate text-[13px]" style={{ color: "var(--color-text)" }}>
            {snippet.title}
          </h3>
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
            <Keyboard size={10} />
            {snippet.hotkey}
          </span>
          <span
            className="text-[11px] px-2 py-0.5 rounded"
            style={snippet.delivery === "fast-type"
              ? { backgroundColor: "var(--color-surface-inset)", color: "var(--color-accent)" }
              : { backgroundColor: "var(--color-surface-inset)", color: "var(--color-success)" }}
          >
            {snippet.delivery === "fast-type" ? (
              <span className="flex items-center gap-1"><Keyboard size={10} /> fast-type</span>
            ) : (
              <span className="flex items-center gap-1"><Clipboard size={10} /> paste</span>
            )}
          </span>
        </div>
        {snippet.description && (
          <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
            {snippet.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => onEdit(snippet)}
          className="flex items-center gap-1 text-[12px]"
          data-testid={`edit-${snippet.id}`}
          style={{ color: "var(--color-accent)" }}
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          onClick={() => onDelete(snippet.id)}
          className="flex items-center gap-1 text-[12px]"
          data-testid={`delete-${snippet.id}`}
          style={{ color: "var(--color-danger)" }}
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </div>
  );
}

function TextSnippetList({ snippets, onEdit, onDelete, onReorder }: TextSnippetListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (snippets.length === 0) {
    return (
      <div className="text-center py-12" data-testid="empty-state" style={{ color: "var(--color-text-secondary)" }}>
        <p className="text-[13px]">No text snippets yet</p>
        <p className="text-[12px] mt-1">Create one to get started.</p>
      </div>
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default TextSnippetList;
