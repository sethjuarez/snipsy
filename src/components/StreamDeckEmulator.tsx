import { useEffect, useMemo, useState } from "react";
import { getBackend } from "../services";
import { useProjectStore } from "../stores/projectStore";
import type { StreamDeckButton, TextSnippet, VideoSnippet } from "../types";
import { streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

const backend = getBackend();

function StreamDeckEmulator() {
  const projectName = useProjectStore((s) => s.projectName);
  const projectPath = useProjectStore((s) => s.projectPath);
  const autoOpenLastProject = useProjectStore((s) => s.autoOpenLastProject);
  const demoMode = useProjectStore((s) => s.demoMode);
  const textSnippets = useProjectStore((s) => s.textSnippets);
  const videoSnippets = useProjectStore((s) => s.videoSnippets);
  const playVideo = useProjectStore((s) => s.playVideo);
  const [status, setStatus] = useState("Ready");

  const buttons = useMemo<StreamDeckButton[]>(() => [
    ...textSnippets.map((snippet) => toButton(snippet, "text")),
    ...videoSnippets.map((snippet) => toButton(snippet, "video")),
  ], [textSnippets, videoSnippets]);
  const [renderedButtons, setRenderedButtons] = useState<StreamDeckButton[]>(buttons);

  useEffect(() => {
    if (!projectName) void autoOpenLastProject();
  }, [autoOpenLastProject, projectName]);

  useEffect(() => {
    let cancelled = false;
    async function refreshRenderedButtons() {
      if (!projectPath) {
        setRenderedButtons(buttons);
        return;
      }

      try {
        const rendered = await backend.listStreamDeckButtons(projectPath);
        if (!cancelled) setRenderedButtons(rendered);
      } catch (error) {
        console.warn("Falling back to frontend Stream Deck icon rendering", error);
        if (!cancelled) setRenderedButtons(buttons);
      }
    }

    void refreshRenderedButtons();
    return () => {
      cancelled = true;
    };
  }, [buttons, projectPath]);

  async function handlePress(button: StreamDeckButton) {
    try {
      if (button.snippetType === "text") {
        const snippet = textSnippets.find((candidate) => candidate.id === button.id);
        if (!snippet) {
          setStatus(`Missing binding: ${button.title}`);
          return;
        }
        await backend.deliverText(snippet.text, snippet.delivery, snippet.typeDelay);
      } else {
        const snippet = videoSnippets.find((candidate) => candidate.id === button.id);
        if (!snippet) {
          setStatus(`Missing binding: ${button.title}`);
          return;
        }
        await playVideo(snippet);
      }
      setStatus(`Triggered ${button.title}`);
    } catch (error) {
      console.error("Stream Deck emulator trigger failed", error);
      setStatus(`Failed: ${button.title}`);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>Snipsy lab</p>
          <h1 className="text-heading font-semibold">Stream Deck Emulator</h1>
          <p className="text-base mt-1" style={{ color: "var(--color-text-secondary)" }}>
            {projectName ? `${projectName}${demoMode ? " · demo mode on" : " · demo mode off"}` : "Open a project to populate buttons."}
          </p>
        </div>
        <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }} data-testid="streamdeck-emulator-status">
          {status}
        </div>
      </header>

      <section
        className="grid gap-3 p-4 rounded-2xl"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", backgroundColor: "#05070d", border: "1px solid var(--color-border)" }}
        data-testid="streamdeck-emulator-grid"
      >
        {renderedButtons.length === 0 ? (
          <div className="col-span-5 text-center py-10" style={{ color: "var(--color-text-secondary)" }}>
            No Stream Deck buttons available.
          </div>
        ) : (
          renderedButtons.map((button) => (
            <button
              key={`${button.snippetType}-${button.id}`}
              type="button"
              onClick={() => void handlePress(button)}
              className="aspect-square rounded-2xl p-2 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95"
              style={{ backgroundColor: "#111827", border: "1px solid #243042" }}
              data-testid={`streamdeck-button-${button.snippetType}-${button.id}`}
              title={`${button.title} · ${button.hotkey}`}
            >
              <img src={button.iconDataUrl} alt="" className="w-full rounded-xl" />
              <span className="text-xs font-medium truncate max-w-full" style={{ color: "#f8fafc" }}>{button.title}</span>
            </button>
          ))
        )}
      </section>
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

export default StreamDeckEmulator;
