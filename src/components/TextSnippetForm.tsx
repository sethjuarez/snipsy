import { useState, useCallback } from "react";
import type { TextSnippet, DeliveryMethod } from "../types";

interface TextSnippetFormProps {
  snippet?: TextSnippet;
  onSave: (snippet: TextSnippet) => void;
  onCancel: () => void;
}

function formatKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrControl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // Use e.code (physical key) instead of e.key (produced character)
  // so Shift+1 gives "1" not "!"
  const code = e.code;
  if (!["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code)) {
    if (code.startsWith("Digit")) {
      parts.push(code.slice(5)); // Digit1 → 1
    } else if (code.startsWith("Key")) {
      parts.push(code.slice(3)); // KeyA → A
    } else if (code.startsWith("Numpad")) {
      parts.push("num" + code.slice(6)); // Numpad1 → num1
    } else {
      parts.push(code); // F1, Space, etc.
    }
  }

  return parts.join("+");
}

function TextSnippetForm({ snippet, onSave, onCancel }: TextSnippetFormProps) {
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
  const [capturingHotkey, setCapturingHotkey] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hotkey) return;

    onSave({
      id: snippet?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      text,
      hotkey,
      delivery,
      typeDelay: delivery === "fast-type" ? typeDelay : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="snippet-form">
      <div>
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Snippet title"
          required
          className="w-full px-3 py-2 rounded text-[13px]"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="snippet-title"
        />
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
          data-testid="snippet-description"
        />
      </div>

      <div>
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          Text Content
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The text to deliver..."
          rows={5}
          className="w-full px-3 py-2 rounded font-mono text-[13px]"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="snippet-text"
        />
      </div>

      <div>
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          Hotkey
        </label>
        <div className="relative">
          <input
            type="text"
            value={capturingHotkey ? "Press a key combo..." : hotkey}
            readOnly
            onFocus={() => setCapturingHotkey(true)}
            onBlur={() => setCapturingHotkey(false)}
            onKeyDown={handleHotkeyCapture}
            placeholder="Click to capture hotkey"
            className="w-full px-3 py-2 rounded font-mono text-[13px]"
            style={capturingHotkey
              ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
              : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="snippet-hotkey"
          />
        </div>
      </div>

      <div>
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
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
            <span className="text-[12px]" style={{ color: "var(--color-text)" }}>Fast Type</span>
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
            <span className="text-[12px]" style={{ color: "var(--color-text)" }}>Paste</span>
          </label>
        </div>
      </div>

      {delivery === "fast-type" && (
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Type Delay (ms)
          </label>
          <input
            type="number"
            value={typeDelay}
            onChange={(e) => setTypeDelay(Number(e.target.value))}
            min={1}
            max={500}
            className="w-32 px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="snippet-type-delay"
          />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          data-testid="snippet-save"
        >
          {snippet ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-surface-alt)", color: "var(--color-text)" }}
          data-testid="snippet-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default TextSnippetForm;
