import { useEffect, useMemo, useState } from "react";
import { getBackend } from "../services";
import { useProjectStore } from "../stores/projectStore";
import type { StreamDeckButton, TextSnippet, VideoSnippet } from "../types";
import { streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

const backend = getBackend();

/** Read-only preview of the keys the Snipsy Stream Deck plugin shows; keys run only from the device. */
function StreamDeckPreview() {
  const projectPath = useProjectStore((s) => s.projectPath);
  const textSnippets = useProjectStore((s) => s.textSnippets);
  const videoSnippets = useProjectStore((s) => s.videoSnippets);

  const fallbackButtons = useMemo<StreamDeckButton[]>(() => [
    ...textSnippets.map((snippet) => toButton(snippet, "text")),
    ...videoSnippets.map((snippet) => toButton(snippet, "video")),
  ], [textSnippets, videoSnippets]);
  const [buttons, setButtons] = useState<StreamDeckButton[]>(fallbackButtons);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!projectPath) {
        setButtons(fallbackButtons);
        return;
      }
      try {
        const rendered = await backend.listStreamDeckButtons(projectPath);
        if (!cancelled) setButtons(rendered);
      } catch (error) {
        console.warn("Falling back to frontend Stream Deck icon rendering", error);
        if (!cancelled) setButtons(fallbackButtons);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [fallbackButtons, projectPath]);

  return (
    <div className="space-y-5">
      <p className="text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="streamdeck-help">
        Each text snippet, clip, and automation becomes a key. This is a preview of what your Stream Deck shows — press the keys on the device to trigger them. Install the Snipsy Stream Deck plugin to connect a device.
      </p>

      {buttons.length === 0 ? (
        <div
          className="text-center py-10 rounded-2xl"
          style={{ color: "var(--color-text-secondary)", backgroundColor: "#05070d", border: "1px solid var(--color-border)" }}
          data-testid="streamdeck-preview-empty"
        >
          No keys yet. Add a text snippet, clip, or automation to create one.
        </div>
      ) : (
        <ul
          className="grid gap-3 p-4 rounded-2xl"
          style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", backgroundColor: "#05070d", border: "1px solid var(--color-border)" }}
          aria-label="Stream Deck keys"
          data-testid="streamdeck-preview-grid"
        >
          {buttons.map((button) => (
            <li
              key={`${button.snippetType}-${button.id}`}
              className="aspect-square rounded-2xl p-2 flex flex-col items-center justify-center gap-1 select-none"
              style={{ backgroundColor: "#111827", border: "1px solid #243042" }}
              data-testid={`streamdeck-key-${button.snippetType}-${button.id}`}
              title={button.hotkey ? `${button.title} · ${button.hotkey}` : button.title}
            >
              <img src={button.iconDataUrl} alt="" className="w-full rounded-xl" draggable={false} />
              <span className="text-xs font-medium truncate max-w-full" style={{ color: "#f8fafc" }}>{button.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toButton(snippet: TextSnippet | VideoSnippet, snippetType: "text" | "video"): StreamDeckButton {
  return {
    id: snippet.id,
    title: snippet.title,
    snippetType,
    hotkey: snippet.hotkey,
    iconDataUrl: streamDeckIconToDataUrl(snippet.streamDeckIcon, snippet.title, snippetType),
  };
}

export default StreamDeckPreview;
