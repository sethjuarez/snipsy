import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextSnippet } from "../types";
import TextSnippetForm from "./TextSnippetForm";

afterEach(cleanup);

describe("TextSnippetForm", () => {
  const fastType: TextSnippet = {
    id: "snippet-1",
    title: "Greeting",
    description: "Says hi",
    text: "hello\nworld",
    hotkey: "CmdOrControl+Shift+2",
    delivery: "fast-type",
    typeDelay: 12,
    typoChance: 3,
    typeVariation: 40,
    streamDeckIcon: { kind: "preset", value: "code", background: "#000000", foreground: "#ffffff" },
  };

  const submit = async (onSave: ReturnType<typeof vi.fn>) => {
    fireEvent.submit(screen.getByTestId("snippet-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    return onSave.mock.calls[0][0] as TextSnippet;
  };

  const slider = (id: string) => screen.getByTestId(id) as HTMLInputElement;

  it("saves every field it was given unchanged", async () => {
    const onSave = vi.fn();
    render(<TextSnippetForm snippet={fastType} onSave={onSave} />);
    expect(await submit(onSave)).toEqual(fastType);
  });

  it("shows typo and rhythm sliders only for fast-type", () => {
    render(<TextSnippetForm snippet={fastType} onSave={vi.fn()} />);
    expect(slider("snippet-typo-chance").value).toBe("3");
    expect(screen.getByTestId("snippet-typo-chance-label").textContent).toBe("3%");
    expect(slider("snippet-type-variation").value).toBe("40");
    expect(screen.getByTestId("snippet-type-variation-label").textContent).toBe("40%");

    fireEvent.click(screen.getByTestId("delivery-paste"));
    expect(screen.queryByTestId("snippet-typo-chance")).toBeNull();
    expect(screen.queryByTestId("snippet-type-variation")).toBeNull();
  });

  it("saves slider changes and drops settings that are off", async () => {
    const onSave = vi.fn();
    render(<TextSnippetForm snippet={fastType} onSave={onSave} />);
    const form = screen.getByTestId("snippet-form");
    expect(screen.getByTestId("snippet-typo-chance-warning")).toBeTruthy();

    fireEvent.change(slider("snippet-typo-chance"), { target: { value: "0" } });
    fireEvent.change(slider("snippet-type-variation"), { target: { value: "75" } });
    expect(screen.getByTestId("snippet-typo-chance-label").textContent).toBe("Off");
    expect(screen.queryByTestId("snippet-typo-chance-warning")).toBeNull();
    expect(form.getAttribute("data-unsaved")).toBe("true");

    const saved = await submit(onSave);
    expect(saved.typoChance).toBeUndefined();
    expect(saved.typeVariation).toBe(75);
  });

  it("reverting a slider clears the unsaved state", () => {
    render(<TextSnippetForm snippet={fastType} onSave={vi.fn()} />);
    const form = screen.getByTestId("snippet-form");
    fireEvent.change(slider("snippet-typo-chance"), { target: { value: "8" } });
    expect(form.getAttribute("data-unsaved")).toBe("true");
    fireEvent.change(slider("snippet-typo-chance"), { target: { value: "3" } });
    expect(form.getAttribute("data-unsaved")).toBe("false");
  });

  it("paste delivery saves no typing settings", async () => {
    const onSave = vi.fn();
    render(<TextSnippetForm snippet={fastType} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("delivery-paste"));
    const saved = await submit(onSave);
    expect(saved.delivery).toBe("paste");
    expect(saved.typeDelay).toBeUndefined();
    expect(saved.typoChance).toBeUndefined();
    expect(saved.typeVariation).toBeUndefined();
  });

  it("brings out-of-range settings back into the slider range", async () => {
    const onSave = vi.fn();
    render(
      <TextSnippetForm
        snippet={{ ...fastType, typoChance: 55, typeVariation: 150 }}
        onSave={onSave}
      />,
    );
    expect(slider("snippet-typo-chance").value).toBe("20");
    expect(slider("snippet-type-variation").value).toBe("100");
    expect(screen.getByTestId("snippet-type-variation-label").textContent).toBe("100%");
    expect(screen.getByTestId("snippet-form").getAttribute("data-unsaved")).toBe("false");

    const saved = await submit(onSave);
    expect(saved.typoChance).toBe(20);
    expect(saved.typeVariation).toBe(100);
  });
});
