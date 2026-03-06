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

  const key = e.key;
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
    if (key.length === 1) {
      parts.push(key.toUpperCase());
    } else {
      parts.push(key);
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Snippet title"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="snippet-title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="snippet-description"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Text Content
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The text to deliver..."
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          data-testid="snippet-text"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
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
            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
              capturingHotkey
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300"
            }`}
            data-testid="snippet-hotkey"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <span className="text-sm text-gray-700">Fast Type</span>
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
            <span className="text-sm text-gray-700">Paste</span>
          </label>
        </div>
      </div>

      {delivery === "fast-type" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type Delay (ms)
          </label>
          <input
            type="number"
            value={typeDelay}
            onChange={(e) => setTypeDelay(Number(e.target.value))}
            min={1}
            max={500}
            className="w-32 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="snippet-type-delay"
          />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          data-testid="snippet-save"
        >
          {snippet ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
          data-testid="snippet-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default TextSnippetForm;
