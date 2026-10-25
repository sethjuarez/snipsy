import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Script } from "../types";
import ScriptForm from "./ScriptForm";

afterEach(cleanup);

const automation: Script = {
  id: "automation-1",
  title: "Prep",
  description: "Opens sites",
  hotkey: "CmdOrControl+Shift+7",
  contributionGroups: [
    {
      id: "group-1",
      title: "Setup",
      contributions: [{ id: "site-1", kind: "openSite", title: "Docs", url: "https://snipsy.dev" }],
    },
  ],
  streamDeckIcon: { kind: "emoji", value: "🎯", background: "#101010", foreground: "#fafafa" },
};

describe("ScriptForm", () => {
  it("saves every field it was given unchanged", async () => {
    const onSave = vi.fn();
    render(<ScriptForm script={automation} onSave={onSave} />);
    fireEvent.submit(screen.getByTestId("automation-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(automation);
  });

  it("edits and saves the Stream Deck icon", async () => {
    const onSave = vi.fn();
    render(<ScriptForm script={{ ...automation, streamDeckIcon: undefined }} onSave={onSave} />);
    expect(screen.getByTestId("automation-streamdeck-icon-preview")).toBeTruthy();
    fireEvent.change(screen.getByTestId("automation-streamdeck-icon-kind"), { target: { value: "emoji" } });
    fireEvent.submit(screen.getByTestId("automation-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].streamDeckIcon).toEqual(expect.objectContaining({ kind: "emoji", value: "🚀" }));
  });

  it("defaults new automations to the rocket preset", async () => {
    const onSave = vi.fn();
    render(<ScriptForm onSave={onSave} />);
    fireEvent.change(screen.getByTestId("automation-title"), { target: { value: "New" } });
    fireEvent.submit(screen.getByTestId("automation-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].streamDeckIcon).toEqual(expect.objectContaining({ kind: "preset", value: "rocket" }));
  });
});
