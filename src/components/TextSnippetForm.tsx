import { useEffect, useState, useCallback } from "react";
import type { TextSnippet, DeliveryMethod, StreamDeckIcon } from "../types";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";
import { STREAM_DECK_PRESETS, defaultStreamDeckIcon, streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

interface TextSnippetFormProps {
  snippet?: TextSnippet;
  onSave: (snippet: TextSnippet) => void;
  hotkeyOwners?: HotkeyOwner[];
  onSaveStateChange?: (state: { canSave: boolean; readinessText: string; saveStatus: "idle" | "unsaved" | "saved" }) => void;
}

function TextSnippetForm({ snippet, onSave, hotkeyOwners = [], onSaveStateChange }: TextSnippetFormProps) {
  const [title, setTitle] = useState(snippet?.title ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [text, setText] = useState(snippet?.text ?? "");
  const [hotkey, setHotkey] = useState(snippet?.hotkey ?? "");
  const [delivery, setDelivery] = useState<DeliveryMethod>(
    snippet?.delivery ?? "fast-type",
  );
  const [typeDelay, setTypeDelay] = useState<number>(
    snippet?.typeDelay ?? 30,
  );
  const initialIcon = snippet?.streamDeckIcon ?? defaultStreamDeckIcon("text");
  const [iconKind, setIconKind] = useState<StreamDeckIcon["kind"]>(initialIcon.kind);
  const [iconPreset, setIconPreset] = useState<string>(initialIcon.kind === "preset" ? initialIcon.value : "text");
  const [iconEmoji, setIconEmoji] = useState(initialIcon.kind === "emoji" ? initialIcon.value : "✨");
  const [iconBackground, setIconBackground] = useState(initialIcon.background ?? "#111827");
  const [iconForeground, setIconForeground] = useState(initialIcon.foreground ?? "#38bdf8");
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saved">("idle");
  const hotkeyStatus = validateHotkey(hotkey, hotkeyOwners, snippet?.id);
  const canSave = Boolean(title.trim()) && hotkeyStatus.state === "available";
  const readinessText = canSave
    ? "Ready"
    : `Needs ${[
      !title.trim() ? "Title" : null,
      hotkeyStatus.state !== "available" ? "Hotkey" : null,
    ].filter(Boolean).join(", ")}`;
  const streamDeckIcon: StreamDeckIcon = iconKind === "emoji"
    ? { kind: "emoji", value: iconEmoji || "✨", background: iconBackground, foreground: iconForeground }
    : iconKind === "generated"
      ? { kind: "generated", background: iconBackground, foreground: iconForeground }
      : { kind: "preset", value: STREAM_DECK_PRESETS.includes(iconPreset as (typeof STREAM_DECK_PRESETS)[number]) ? iconPreset as (typeof STREAM_DECK_PRESETS)[number] : "text", background: iconBackground, foreground: iconForeground };
  const streamDeckPreview = streamDeckIconToDataUrl(streamDeckIcon, title || "Snippet", "text");

  const handleHotkeyCapture = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = formatKeyCombo(e.nativeEvent);
      // Only accept combos with a modifier + a non-modifier key
      if (combo.includes("+") && !combo.endsWith("+")) {
        setHotkey(combo);
        setCapturingHotkey(false);
      }
    },
    [],
  );

  const saveSnippet = () => {
    if (!canSave) return;

    onSave({
      id: snippet?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      text,
      hotkey,
      delivery,
      typeDelay: delivery === "fast-type" ? typeDelay : undefined,
      streamDeckIcon,
    });
    setSaveStatus("saved");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSnippet();
  };

  useEffect(() => {
    if (saveStatus === "saved") setSaveStatus("unsaved");
  }, [title, description, text, hotkey, delivery, typeDelay, iconKind, iconPreset, iconEmoji, iconBackground, iconForeground]);

  useEffect(() => {
    onSaveStateChange?.({ canSave, readinessText: saveStatus === "saved" ? "Saved" : readinessText, saveStatus });
  }, [canSave, onSaveStateChange, readinessText, saveStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s" || capturingHotkey) return;
      event.preventDefault();
      saveSnippet();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <form id="text-snippet-editor-form" onSubmit={handleSubmit} className="space-y-4" data-testid="snippet-form">
      <div>
        <label htmlFor="snippet-title" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Title
        </label>
        <input
          id="snippet-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Snippet title"
          required
          className="w-full px-3 py-2 rounded text-md"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="snippet-title"
        />
      </div>

      <div>
        <label htmlFor="snippet-description" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Description
        </label>
        <input
          id="snippet-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 rounded text-md"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="snippet-description"
        />
      </div>

      <div>
        <label htmlFor="snippet-text" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Text Content
        </label>
        <textarea
          id="snippet-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The text to deliver..."
          rows={5}
          className="w-full px-3 py-2 rounded font-mono text-md"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="snippet-text"
        />
      </div>

      <div>
        <label htmlFor="snippet-hotkey" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Hotkey
        </label>
        <div className="relative">
          <input
            id="snippet-hotkey"
            type="text"
            value={capturingHotkey ? "Press a key combo..." : hotkey}
            readOnly
            onFocus={() => setCapturingHotkey(true)}
            onBlur={() => setCapturingHotkey(false)}
            onKeyDown={handleHotkeyCapture}
            placeholder="Click to capture hotkey"
            className="w-full px-3 py-2 rounded font-mono text-md"
            style={capturingHotkey
              ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
              : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="snippet-hotkey"
            aria-describedby="snippet-hotkey-status"
          />
        </div>
        <p
          id="snippet-hotkey-status"
          className="mt-1 text-sm"
          style={{
            color:
              hotkeyStatus.state === "available"
                ? "var(--color-success)"
                : hotkeyStatus.state === "conflict" || hotkeyStatus.state === "invalid"
                  ? "var(--color-danger)"
                  : "var(--color-text-secondary)",
          }}
          data-testid="snippet-hotkey-status"
        >
          {hotkeyStatus.message}
        </p>
      </div>

      <div>
        <label htmlFor="snippet-delivery" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Delivery Method
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="delivery"
              value="fast-type"
              checked={delivery === "fast-type"}
              onChange={() => setDelivery("fast-type")}
              data-testid="delivery-fast-type"
            />
            <span className="text-base" style={{ color: "var(--color-text)" }}>Fast Type</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="delivery"
              value="paste"
              checked={delivery === "paste"}
              onChange={() => setDelivery("paste")}
              data-testid="delivery-paste"
            />
            <span className="text-base" style={{ color: "var(--color-text)" }}>Paste</span>
          </label>
        </div>
      </div>

      {delivery === "fast-type" && (
        <div>
          <label htmlFor="snippet-type-delay" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
            Type Delay (ms)
          </label>
          <input
            id="snippet-type-delay"
            type="number"
            value={typeDelay}
            onChange={(e) => setTypeDelay(Number(e.target.value))}
            min={1}
            max={500}
            className="w-32 px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="snippet-type-delay"
          />
        </div>
      )}

      <div>
        <label className="block font-medium mb-2 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Icon
        </label>
        <div className="flex gap-3 items-start">
          <img src={streamDeckPreview} alt="" className="w-20 h-20 rounded-xl" data-testid="snippet-streamdeck-icon-preview" />
          <div className="grid grid-cols-2 gap-3 flex-1">
            <select
              value={iconKind}
              onChange={(e) => setIconKind(e.target.value as StreamDeckIcon["kind"])}
              className="px-3 py-2 rounded text-md"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid="snippet-streamdeck-icon-kind"
            >
              <option value="preset">Preset</option>
              <option value="emoji">Emoji</option>
              <option value="generated">Generated initials</option>
            </select>
            {iconKind === "preset" ? (
              <select
                value={iconPreset}
                onChange={(e) => setIconPreset(e.target.value)}
                className="px-3 py-2 rounded text-md"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid="snippet-streamdeck-icon-preset"
              >
                {STREAM_DECK_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            ) : iconKind === "emoji" ? (
              <input
                value={iconEmoji}
                onChange={(e) => setIconEmoji(e.target.value)}
                className="px-3 py-2 rounded text-md"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid="snippet-streamdeck-icon-emoji"
              />
            ) : (
              <div className="px-3 py-2 rounded text-md" style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                Uses title initials
              </div>
            )}
            <input
              type="color"
              aria-label="Icon background"
              value={iconBackground}
              onChange={(e) => setIconBackground(e.target.value)}
              className="h-10 w-full rounded"
              data-testid="snippet-streamdeck-icon-background"
            />
            <input
              type="color"
              aria-label="Icon foreground"
              value={iconForeground}
              onChange={(e) => setIconForeground(e.target.value)}
              className="h-10 w-full rounded"
              data-testid="snippet-streamdeck-icon-foreground"
            />
          </div>
        </div>
      </div>

    </form>
  );
}

export default TextSnippetForm;
