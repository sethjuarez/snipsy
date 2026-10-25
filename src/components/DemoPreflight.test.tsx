import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoPreflightPanel, DemoStartDialog } from "./DemoPreflight";
import { computePreflight, DEMO_INTRO_SEEN_KEY } from "../utils/preflight";
import type { TextSnippet } from "../types";

const snippet: TextSnippet = { id: "t", title: "Hello", description: "", text: "hi", hotkey: "CmdOrControl+Shift+1", delivery: "paste" };
const ready = computePreflight({ textSnippets: [snippet], videoSnippets: [], automations: [], elevated: false });
const empty = computePreflight({ textSnippets: [], videoSnippets: [], automations: [] });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("DemoPreflightPanel", () => {
  it("shows the checklist and points to the title bar to start", () => {
    render(<DemoPreflightPanel preflight={ready} demoMode={false} projectName="Keynote" />);
    expect(screen.getByTestId("demo-readiness-status").textContent).toBe("Ready with warnings");
    expect(screen.getByTestId("preflight-hotkeys").getAttribute("data-state")).toBe("pass");
    expect(screen.getByTestId("preflight-elevation").textContent).toContain("Warning:");
    expect(screen.getByTestId("demo-live-status").textContent).toContain("Start from the top bar");
  });

  it("leaves Start, Stop and Keep awake to the title bar", () => {
    const { rerender } = render(<DemoPreflightPanel preflight={ready} demoMode={false} projectName="Keynote" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    rerender(<DemoPreflightPanel preflight={ready} demoMode projectName="Keynote" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows live status while demoing", () => {
    render(<DemoPreflightPanel preflight={ready} demoMode projectName="Keynote" />);
    expect(screen.getByTestId("demo-readiness-status").textContent).toBe("Live");
    expect(screen.getByTestId("demo-live-status").textContent).toContain("Keynote · 1 hotkey armed. Stop from the top bar");
    expect(screen.queryByTestId("demo-preflight-checks")).toBeNull();
  });

  it("uses the live armed count when registrations failed", () => {
    render(<DemoPreflightPanel preflight={ready} demoMode projectName="Keynote" liveArmedCount={0} />);
    expect(screen.getByTestId("demo-live-status").textContent).toContain("Keynote · 0 hotkeys armed");
  });

  it("marks an empty project as not ready", () => {
    render(<DemoPreflightPanel preflight={empty} demoMode={false} projectName="Keynote" />);
    expect(screen.getByTestId("demo-readiness-status").textContent).toBe("Not ready");
  });
});

describe("DemoStartDialog", () => {
  it("explains what happens and starts after closing", () => {
    const order: string[] = [];
    render(<DemoStartDialog preflight={ready} onStart={() => order.push("start")} onClose={() => order.push("close")} />);
    expect(screen.getByTestId("demo-start-armed").textContent).toBe("1 hotkey will listen system-wide.");
    expect(screen.getByTestId("preflight-elevation")).toBeTruthy();
    fireEvent.click(screen.getByTestId("demo-start-confirm"));
    expect(order).toEqual(["close", "start"]);
    expect(localStorage.getItem(DEMO_INTRO_SEEN_KEY)).toBeNull();
  });

  it("remembers don't show again", () => {
    render(<DemoStartDialog preflight={ready} onStart={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("demo-start-dont-show"));
    fireEvent.click(screen.getByTestId("demo-start-confirm"));
    expect(localStorage.getItem(DEMO_INTRO_SEEN_KEY)).toBe("true");
  });

  it("offers start anyway when nothing is armed and cancel does not start", () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(<DemoStartDialog preflight={empty} onStart={onStart} onClose={onClose} />);
    expect(screen.getByTestId("demo-start-armed").textContent).toBe("No hotkeys will be armed.");
    expect(screen.getByTestId("demo-start-confirm").textContent).toBe("Start anyway");
    fireEvent.click(screen.getByTestId("demo-start-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
});
