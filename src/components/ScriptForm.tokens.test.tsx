import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Script } from "../types";

vi.mock("../services", () => ({ getBackend: () => ({}) }));
vi.mock("../services/auditaur", () => ({ isTauriRuntime: () => false, tauriFileSrc: (file: string) => file }));
const { default: ScriptForm } = await import("./ScriptForm");

afterEach(cleanup);

const script = (url: string, title = "Open site"): Script => ({
  id: "s", title: "Portal", description: "",
  contributionGroups: [{ id: "g", title: "Step 1", contributions: [{ id: "c", kind: "openSite", title, url }] }],
});

describe("ScriptForm tokens", () => {
  it("accepts variable templates in the URL and says what Snipsy fills in", () => {
    render(<ScriptForm script={script("https://{{var:host}}/{{date:iso}}")} onSave={vi.fn()} projectVariables={[{ name: "host", value: "x" }]} />);
    expect(screen.getByTestId("contribution-url-0-0").getAttribute("type")).toBe("text");
    expect(screen.getByTestId("contribution-tokens-0-0").textContent).toBe("Snipsy fills in {{var:host}}, {{date:iso}} when it runs.");
  });

  it("flags snippet-only tokens and undefined variables per field", () => {
    const { rerender } = render(<ScriptForm script={script("https://x", "{{clipboard}}")} onSave={vi.fn()} />);
    expect(screen.getByTestId("contribution-token-problem-0-0").textContent).toBe("Title: {{clipboard}} only works in snippet text.");
    rerender(<ScriptForm key="2" script={script("https://{{var:host}}")} onSave={vi.fn()} projectVariables={[]} />);
    expect(screen.getByTestId("contribution-token-problem-0-0").textContent).toContain("URL:");
    expect(screen.getByTestId("contribution-token-problem-0-0").textContent).toContain("host");
  });

  it("inserts a variable into the focused field", () => {
    render(<ScriptForm script={script("https://")} onSave={vi.fn()} projectVariables={[{ name: "host", value: "x" }]} />);
    const title = screen.getByTestId("contribution-title-0-0") as HTMLInputElement;
    fireEvent.focus(title);
    title.setSelectionRange(title.value.length, title.value.length);
    fireEvent.change(screen.getByTestId("contribution-insert-token-0-0"), { target: { value: "{{var:host}}" } });
    expect(title.value).toBe("Open site{{var:host}}");

    const url = screen.getByTestId("contribution-url-0-0") as HTMLInputElement;
    fireEvent.focus(url);
    url.setSelectionRange(url.value.length, url.value.length);
    fireEvent.change(screen.getByTestId("contribution-insert-token-0-0"), { target: { value: "{{var:host}}" } });
    expect(url.value).toBe("https://{{var:host}}");
  });
});
