import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import ScriptForm from "./ScriptForm";

vi.mock("../services", () => ({
  getBackend: () => ({ listStreamDeckButtons: vi.fn().mockResolvedValue([]) }),
}));
vi.mock("../services/auditaur", () => ({ isTauriRuntime: () => false, tauriFileSrc: (file: string) => file }));

const { default: StreamDeckEmulator } = await import("./StreamDeckEmulator");

afterEach(cleanup);

describe("Sidebar", () => {
  it("groups source videos and clips under Media", () => {
    render(<Sidebar activeView="videos" onViewChange={vi.fn()} />);
    const media = screen.getByRole("group", { name: "Media" });
    expect(media.textContent).toContain("Source videos");
    expect(media.textContent).toContain("Clips");
    expect(screen.getByTestId("nav-videos").getAttribute("aria-current")).toBe("page");
  });

  it("navigates to the Stream Deck view", () => {
    const onViewChange = vi.fn();
    render(<Sidebar activeView="home" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByTestId("nav-stream-deck"));
    expect(onViewChange).toHaveBeenCalledWith("stream-deck");
  });

  it("labels close project separately from Overview", () => {
    const onCloseProject = vi.fn();
    render(<Sidebar activeView="home" onViewChange={vi.fn()} onCloseProject={onCloseProject} />);
    expect(screen.getByTestId("nav-home").textContent).toBe("Overview");
    fireEvent.click(screen.getByRole("button", { name: "Close project" }));
    expect(onCloseProject).toHaveBeenCalled();
  });

  it("keeps accessible names when collapsed", () => {
    render(<Sidebar activeView="home" onViewChange={vi.fn()} onCloseProject={vi.fn()} collapsed />);
    expect(screen.getByRole("button", { name: "Clips" }).textContent).toBe("");
    expect(screen.queryByText("Media")).toBeNull();
    expect(screen.getByRole("button", { name: "Close project" })).toBeTruthy();
  });
});

describe("ScriptForm steps", () => {
  it("uses step and action wording", () => {
    render(<ScriptForm onSave={vi.fn()} />);
    expect(screen.getByTestId("automation-steps-help").textContent).toMatch(/run in order/);
        expect(screen.getByTestId("no-contributions").textContent).toMatch(/No steps yet/);
        fireEvent.click(screen.getByTestId("add-contribution-group"));    expect(screen.getByTestId("contribution-group-title-0")).toHaveProperty("value", "Step 1");
    expect(screen.getByTestId("add-open-site-0").textContent).toContain("Add action");
    fireEvent.click(screen.getByTestId("add-contribution-group"));
    expect(screen.getByRole("textbox", { name: "Step 2 name" })).toHaveProperty("value", "Step 2");
  });
});

describe("StreamDeckEmulator", () => {
  it("drops the standalone heading when embedded", () => {
    render(<StreamDeckEmulator embedded />);
    expect(screen.queryByText("Stream Deck Emulator")).toBeNull();
    expect(screen.getByTestId("streamdeck-help").textContent).toMatch(/triggers it for real/);
  });
});
