import { useEffect, useState, useCallback } from "react";
import type { TextSnippet, DeliveryMethod, StreamDeckIcon } from "../types";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";
import { defaultStreamDeckIcon } from "../utils/streamDeckIcons";
import { useSaveTracking, type EditorSaveState } from "../hooks/useSaveTracking";
import IconEditor from "./IconEditor";

// Match the clamps in src-tauri/src/typing.rs.
const MAX_TYPO_CHANCE = 20;
const MAX_TYPE_VARIATION = 100;

/** A whole percent within 0..max; missing or invalid values read as off. */
function toPercent(value: number | undefined, max: number): number {
  const percent = Math.round(Number(value ?? 0));
  return Number.isFinite(percent) ? Math.min(max, Math.max(0, percent)) : 0;
}

const formatPercent = (value: number) => (value === 0 ? "Off" : `${value}%`);

interface PercentSliderProps {
  id: string;
  label: string;
  hint: string;
  warning?: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

function PercentSlider({ id, label, hint, warning, value, max, onChange }: PercentSliderProps) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-48 accent-[var(--color-accent)]"
          aria-valuetext={formatPercent(value)}
          aria-describedby={`${id}-hint`}
          data-testid={id}
        />
        <span className="w-10 tabular-nums text-base" style={{ color: "var(--color-text)" }} data-testid={`${id}-label`}>
          {formatPercent(value)}
        </span>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {hint}
        {warning && (
          <span className="block mt-1" style={{ color: "var(--color-warning)" }} data-testid={`${id}-warning`}>
            {warning}
          </span>
        )}
      </p>
    </div>
  );
}

interface TextSnippetFormProps {
  snippet?: TextSnippet;
  onSave: (snippet: TextSnippet) => Promise<void> | void;
  hotkeyOwners?: HotkeyOwner[];
  onSaveStateChange?: (state: EditorSaveState) => void;
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
  const [typoChance, setTypoChance] = useState(() => toPercent(snippet?.typoChance, MAX_TYPO_CHANCE));
  const [typeVariation, setTypeVariation] = useState(() => toPercent(snippet?.typeVariation, MAX_TYPE_VARIATION));
  const [streamDeckIcon, setStreamDeckIcon] = useState<StreamDeckIcon>(snippet?.streamDeckIcon ?? defaultStreamDeckIcon("text"));
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const { saveStatus, hasUnsavedChanges, runSave } = useSaveTracking({
    title: title.trim(),
    description: description.trim(),
    text,
    hotkey,
    delivery,
    typeDelay,
    typoChance,
    typeVariation,
    streamDeckIcon,
  });
  const hotkeyStatus = validateHotkey(hotkey, hotkeyOwners, snippet?.id);
  const canSave = Boolean(title.trim()) && hotkeyStatus.state === "available";
  const readinessText = canSave
    ? "Ready"
    : `Needs ${[
      !title.trim() ? "Title" : null,
      hotkeyStatus.state !== "available" ? "Hotkey" : null,
    ].filter(Boolean).join(", ")}`;
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

    const fastType = delivery === "fast-type";
    void runSave(() => onSave({
      id: snippet?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      text,
      hotkey,
      delivery,
      typeDelay: fastType ? typeDelay : undefined,
      typoChance: fastType && typoChance > 0 ? typoChance : undefined,
      typeVariation: fastType && typeVariation > 0 ? typeVariation : undefined,
      streamDeckIcon,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSnippet();
  };

  useEffect(() => {
    onSaveStateChange?.({ canSave, readinessText, saveStatus, hasUnsavedChanges });
  }, [canSave, onSaveStateChange, readinessText, saveStatus, hasUnsavedChanges]);

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
    <form id="text-snippet-editor-form" onSubmit={handleSubmit} className="space-y-4" data-testid="snippet-form" data-unsaved={hasUnsavedChanges ? "true" : "false"}>
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
        <>
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

          <PercentSlider
            id="snippet-typo-chance"
            label="Typos"
            hint="Chance each letter (A–Z) or digit is mistyped, then fixed with Backspace."
            warning={typoChance > 0
              ? "Turn off for fields with inline autocomplete, like browser address bars and spreadsheet cells."
              : undefined}
            value={typoChance}
            max={MAX_TYPO_CHANCE}
            onChange={setTypoChance}
          />

          <PercentSlider
            id="snippet-type-variation"
            label="Rhythm Variation"
            hint="Uneven key timing, with short pauses after spaces and line breaks."
            value={typeVariation}
            max={MAX_TYPE_VARIATION}
            onChange={setTypeVariation}
          />
        </>
      )}

      <IconEditor
        icon={streamDeckIcon}
        title={title || "Snippet"}
        snippetType="text"
        onChange={setStreamDeckIcon}
        testIdPrefix="snippet-streamdeck-icon"
      />

    </form>
  );
}

export default TextSnippetForm;
