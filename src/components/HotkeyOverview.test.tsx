import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HotkeyOverview from "./HotkeyOverview";
import type { TextSnippet } from "../types";

const snippet: TextSnippet = { id: "t1", title: "Greeting", description: "", text: "Hi", hotkey: "CmdOrControl+Shift+1", delivery: "paste" };

afterEach(cleanup);

describe("HotkeyOverview", () => {
  it("frames an empty project as an empty run sheet", () => {
    render(<HotkeyOverview textSnippets={[]} videoSnippets={[]} />);
    expect(screen.getByTestId("hotkey-overview-empty").textContent).toContain("Your run sheet is empty");
  });

  it("labels the cards as the run sheet", () => {
    render(<HotkeyOverview textSnippets={[snippet]} videoSnippets={[]} />);
    expect(screen.getByRole("region", { name: "Run sheet" }).textContent).toContain("Greeting");
    expect(screen.getByTestId("run-sheet-help").textContent).toMatch(/order you'll present/);
  });
});
