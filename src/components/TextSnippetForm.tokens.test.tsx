import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TextSnippet } from "../types";

const backend = vi.hoisted(() => ({}));
vi.mock("../services", () => ({ getBackend: () => backend }));

const { default: TextSnippetForm } = await import("./TextSnippetForm");
const { useProjectStore } = await import("../stores/projectStore");

const base: TextSnippet = { id: "s", title: "Login", description: "", text: "", hotkey: "CmdOrControl+Shift+9", delivery: "fast-type" };
const textArea = () => screen.getByTestId("snippet-text") as HTMLTextAreaElement;
const problem = () => screen.queryByTestId("snippet-image-problem")?.textContent ?? null;
const summary = () => screen.queryByTestId("snippet-tokens")?.textContent ?? null;

const renderForm = (snippet: TextSnippet = base, onSave = vi.fn()) => {
  render(<TextSnippetForm snippet={snippet} onSave={onSave} projectPath="C:/p" availableImageKeys={new Set()} />);
  return onSave;
};

beforeEach(() => {
  useProjectStore.setState({ projectVariables: [{ name: "host", value: "contoso.com" }] });
});
afterEach(cleanup);

describe("TextSnippetForm tokens", () => {
  it("summarizes the tokens Snipsy fills in and flags undefined variables", () => {
    renderForm({ ...base, text: "https://{{var:host}}/{{cursor}} on {{date:iso}}" });
    expect(summary()).toBe("Snipsy fills in {{var:host}}, {{cursor}}, {{date:iso}} when it types. Check Type literally to keep them as written.");
    expect(problem()).toBeNull();

    fireEvent.change(textArea(), { target: { value: "{{var:region}}" } });
    expect(problem()).toBe("Undefined variable: region. Add it in Settings → Project.");
    expect(summary()).toBeNull();
  });

  it("leaves code that looks like tokens alone", () => {
    renderForm({ ...base, text: "<div style={{cursor:'pointer'}}>{{ name }}</div>" });
    expect(summary()).toBeNull();
    expect(problem()).toBeNull();
  });

  it("inserts built-in tokens and project variables at the cursor", () => {
    renderForm({ ...base, text: "ab" });
    textArea().focus();
    textArea().setSelectionRange(1, 1);
    fireEvent.change(screen.getByTestId("snippet-insert-token"), { target: { value: "{{var:host}}" } });
    expect(textArea().value).toBe("a{{var:host}}b");
  });

  it("types literally when raw is on and saves the flag", async () => {
    const onSave = renderForm({ ...base, text: "{{date:nope}}" });
    expect(problem()).toContain("date");

    fireEvent.click(screen.getByTestId("snippet-raw"));
    expect(problem()).toBeNull();
    expect((screen.getByTestId("snippet-insert-token") as HTMLSelectElement).disabled).toBe(true);

    fireEvent.submit(screen.getByTestId("snippet-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ raw: true, text: "{{date:nope}}" })));
  });
});
