import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamDeckButton } from "../types";

const backend = vi.hoisted(() => ({ listStreamDeckButtons: vi.fn() }));
vi.mock("../services", () => ({ getBackend: () => backend }));

const { useProjectStore } = await import("../stores/projectStore");
const { default: StreamDeckPreview } = await import("./StreamDeckPreview");

const key = (id: string, snippetType: StreamDeckButton["snippetType"], hotkey = ""): StreamDeckButton => ({
  id, title: `Key ${id}`, snippetType, hotkey, iconDataUrl: "data:image/svg+xml,",
});

afterEach(() => {
  cleanup();
  useProjectStore.setState({ projectPath: null });
});

describe("StreamDeckPreview", () => {
  it("shows the project's keys as a read-only list", async () => {
    backend.listStreamDeckButtons.mockResolvedValue([key("a", "text", "CmdOrControl+Shift+7"), key("b", "automation")]);
    useProjectStore.setState({ projectPath: "C:/p" });
    render(<StreamDeckPreview />);

    const grid = await screen.findByRole("list", { name: "Stream Deck keys" });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(grid.querySelector("button")).toBeNull();
    expect(screen.getByTestId("streamdeck-key-text-a").getAttribute("title")).toBe("Key a · CmdOrControl+Shift+7");
    expect(screen.getByTestId("streamdeck-key-automation-b").getAttribute("title")).toBe("Key b");
    expect(backend.listStreamDeckButtons).toHaveBeenCalledWith("C:/p");
  });

  it("shows an empty state when there are no keys", async () => {
    backend.listStreamDeckButtons.mockResolvedValue([]);
    useProjectStore.setState({ projectPath: "C:/p" });
    render(<StreamDeckPreview />);
    await waitFor(() => expect(screen.getByTestId("streamdeck-preview-empty")).toBeTruthy());
  });
});
