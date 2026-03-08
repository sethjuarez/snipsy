import { useState, useMemo, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { Keyboard, Play, Film, FileText, MousePointerClick, MousePointer, MousePointer2Off, GripVertical } from "lucide-react";
import type { TextSnippet, VideoSnippet } from "../types";

interface HotkeyOverviewProps {
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  onPlayVideo?: (snippet: VideoSnippet) => void;
}

type CardItem =
  | { kind: "text"; id: string; snippet: TextSnippet }
  | { kind: "video"; id: string; snippet: VideoSnippet };

const STORAGE_KEY = "snipsy:overviewOrder";

function loadOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOrder(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function SortableCard({ item, onPlay }: { item: CardItem; onPlay?: (s: VideoSnippet) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const dragProps = { attributes, listeners };
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    maxWidth: 300,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, height: 200 }} data-testid="hotkey-entry">
      {item.kind === "text" ? (
        <TextCardInner snippet={item.snippet} dragProps={dragProps} />
      ) : (
        <VideoCardInner snippet={item.snippet} onPlay={onPlay} dragProps={dragProps} />
      )}
    </div>
  );
}

interface DragProps {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: SyntheticListenerMap | undefined;
}

function TextCardInner({ snippet, dragProps }: { snippet: TextSnippet; dragProps: DragProps }) {
  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col h-full"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
    >
      {/* Title bar */}
      <div className="px-3 py-2 flex items-center gap-2">
        <button
          className="shrink-0 cursor-grab active:cursor-grabbing"
          style={{ color: "var(--color-text-secondary)" }}
          {...dragProps.attributes}
          {...(dragProps.listeners ?? {})}
          data-testid="drag-handle"
        >
          <GripVertical size={12} />
        </button>
        <FileText size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text)" }}>
          {snippet.title}
        </span>
      </div>
      {/* Text preview */}
      <div
        className="px-3 py-3 overflow-hidden flex-1"
        style={{ backgroundColor: "var(--color-surface-inset)" }}
      >
        <pre
          className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {snippet.text}
        </pre>
      </div>
      {/* Footer: hotkey + delivery method */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span
          className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-mono shrink-0"
          style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
        >
          <Keyboard size={10} />
          {snippet.hotkey}
        </span>
        <span className="text-[10px] ml-auto shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
          {snippet.delivery === "paste" ? "Paste" : "Fast-type"}
        </span>
      </div>
    </div>
  );
}

function VideoCardInner({ snippet, onPlay, dragProps }: { snippet: VideoSnippet; onPlay?: (s: VideoSnippet) => void; dragProps: DragProps }) {
  const duration = snippet.endTime - snippet.startTime;

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col h-full"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
    >
      {/* Title bar */}
      <div className="px-3 py-2 flex items-center gap-2">
        <button
          className="shrink-0 cursor-grab active:cursor-grabbing"
          style={{ color: "var(--color-text-secondary)" }}
          {...dragProps.attributes}
          {...(dragProps.listeners ?? {})}
          data-testid="drag-handle"
        >
          <GripVertical size={12} />
        </button>
        <Film size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text)" }}>
          {snippet.title}
        </span>
      </div>
      {/* Video preview */}
      <div
        className="relative flex items-center justify-center flex-1"
        style={{ backgroundColor: snippet.backgroundColor || "#000000" }}
      >
        {onPlay && (
          <button
            onClick={() => onPlay(snippet)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            title="Preview clip"
            data-testid={`overview-play-${snippet.id}`}
          >
            <Play size={18} fill="currentColor" />
          </button>
        )}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}>
            {duration.toFixed(1)}s @ {snippet.speed}×
          </span>
        </div>
      </div>
      {/* Footer: hotkey + extras */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span
          className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-mono shrink-0"
          style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
        >
          <Keyboard size={10} />
          {snippet.hotkey}
        </span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span
            className="inline-block w-3.5 h-3.5 rounded-sm border"
            style={{
              backgroundColor: snippet.backgroundColor || "#000000",
              borderColor: "var(--color-border)",
            }}
            title={`Background: ${snippet.backgroundColor || "#000000"}`}
          />
          <span title={snippet.hideCursor !== false ? "Cursor hidden" : "Cursor visible"}>
            {snippet.hideCursor !== false
              ? <MousePointer2Off size={10} style={{ color: "var(--color-text-secondary)" }} />
              : <MousePointer size={10} style={{ color: "var(--color-text-secondary)" }} />
            }
          </span>
          {snippet.clickToPlay && (
            <span title="Click to play">
              <MousePointerClick size={10} style={{ color: "var(--color-text-secondary)" }} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function HotkeyOverview({ textSnippets, videoSnippets, onPlayVideo }: HotkeyOverviewProps) {
  const allItems = useMemo<CardItem[]>(() => {
    const texts: CardItem[] = textSnippets.map((s) => ({ kind: "text", id: s.id, snippet: s }));
    const videos: CardItem[] = videoSnippets.map((s) => ({ kind: "video", id: s.id, snippet: s }));
    return [...texts, ...videos];
  }, [textSnippets, videoSnippets]);

  const [orderedIds, setOrderedIds] = useState<string[]>(() => loadOrder());

  // Merge saved order with actual items: known IDs first (in saved order), then any new ones appended
  const sortedItems = useMemo(() => {
    const itemMap = new Map(allItems.map((item) => [item.id, item]));
    const result: CardItem[] = [];
    for (const id of orderedIds) {
      const item = itemMap.get(id);
      if (item) {
        result.push(item);
        itemMap.delete(id);
      }
    }
    // Append any items not yet in the saved order
    for (const item of itemMap.values()) {
      result.push(item);
    }
    return result;
  }, [allItems, orderedIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = sortedItems.map((i) => i.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = arrayMove(ids, oldIndex, newIndex);
      setOrderedIds(newIds);
      saveOrder(newIds);
    },
    [sortedItems],
  );

  if (allItems.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }} data-testid="hotkey-overview-empty">
        <Keyboard size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-[13px]">No hotkeys configured yet</p>
        <p className="text-[12px] mt-1">Create text snippets or video clips to assign hotkeys.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedItems.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 300px))" }} data-testid="hotkey-overview">
          {sortedItems.map((item) => (
            <SortableCard key={item.id} item={item} onPlay={item.kind === "video" ? onPlayVideo : undefined} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default HotkeyOverview;
