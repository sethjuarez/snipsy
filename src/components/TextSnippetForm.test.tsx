import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextSnippet } from "../types";
import TextSnippetForm from "./TextSnippetForm";

afterEach(cleanup);

describe("TextSnippetForm", () => {
  it("saves every field it was given unchanged", async () => {
    const snippet: TextSnippet = {
      id: "snippet-1",
      title: "Greeting",
      description: "Says hi",
      text: "hello\nworld",
      hotkey: "CmdOrControl+Shift+2",
      delivery: "fast-type",
      typeDelay: 12,
      streamDeckIcon: { kind: "preset", value: "code", background: "#000000", foreground: "#ffffff" },
    };
    const onSave = vi.fn();
    render(<TextSnippetForm snippet={snippet} onSave={onSave} />);
    fireEvent.submit(screen.getByTestId("snippet-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(snippet);
  });
});
