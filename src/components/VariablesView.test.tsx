import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VariablesView from "./VariablesView";
import type { VariableUsage } from "../utils/variableUsage";

afterEach(cleanup);

const noUsage = new Map<string, VariableUsage>();

describe("VariablesView", () => {
  it("adds, validates, and saves variables", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<VariablesView variables={[{ name: "host", value: "contoso.com" }]} usage={noUsage} onSave={onSave} />);
    const save = screen.getByTestId("variables-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("variable-add"));
    const names = screen.getAllByTestId("variable-name");
    fireEvent.change(names[1], { target: { value: "host" } });
    expect(screen.getByTestId("variables-problem").textContent).toContain('"host" is defined twice');
    expect(save.disabled).toBe(true);

    fireEvent.change(names[1], { target: { value: "Region" } });
    fireEvent.change(screen.getAllByTestId("variable-value")[1], { target: { value: "West US" } });
    expect(screen.queryByTestId("variables-problem")).toBeNull();
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([
      { name: "host", value: "contoso.com" },
      { name: "region", value: "West US" },
    ]));
  });

  it("removes a variable", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<VariablesView variables={[{ name: "host", value: "x" }]} usage={noUsage} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("variable-remove"));
    fireEvent.click(screen.getByTestId("variables-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([]));
  });

  it("shows who uses each variable and offers to add missing ones", () => {
    const usage = new Map<string, VariableUsage>([
      ["host", { snippets: ["Intro"], automations: ["Portal"] }],
      ["region", { snippets: ["Outro"], automations: [] }],
    ]);
    const onDirtyChange = vi.fn();
    render(<VariablesView variables={[{ name: "host", value: "x" }, { name: "unused", value: "" }]} usage={usage} onSave={vi.fn()} onDirtyChange={onDirtyChange} />);
    const usedBy = screen.getAllByTestId("variable-used-by");
    expect(usedBy[0].textContent).toBe("2 items");
    expect(usedBy[0].getAttribute("title")).toBe("Snippet: Intro\nAutomation: Portal");
    expect(usedBy[1].textContent).toBe("Unused");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "region" }));
    expect(screen.queryByTestId("variables-missing")).toBeNull();
    expect((screen.getAllByTestId("variable-name")[2] as HTMLInputElement).value).toBe("region");
    expect(screen.getAllByTestId("variable-used-by")[2].textContent).toBe("1 item");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
