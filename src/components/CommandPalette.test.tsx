import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CommandPalette from "./CommandPalette";
import ShortcutsDialog from "./ShortcutsDialog";
import { ALL_SHORTCUTS, type AppCommand } from "../commands/catalog";

afterEach(cleanup);

function makeCommands() {
  const commands: AppCommand[] = [
    { id: "nav.home", title: "Go to Overview", group: "Navigation", run: vi.fn() },
    { id: "create.text", title: "New text snippet", group: "Create", run: vi.fn() },
    { id: "automation.run.a", title: "Run Open docs", group: "Automations", disabledReason: "Another automation is running", run: vi.fn() },
  ];
  return commands;
}

describe("CommandPalette", () => {
  it("focuses the search input and lists commands", () => {
    render(<CommandPalette commands={makeCommands()} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByTestId("command-palette-input"));
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("filters and shows an empty state", () => {
    render(<CommandPalette commands={makeCommands()} onClose={vi.fn()} />);
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "snippet" } });
    expect(screen.getAllByRole("option").map((option) => option.dataset.testid)).toEqual(["command-palette-option-create.text"]);
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getByTestId("command-palette-empty")).toBeTruthy();
  });

  it("moves with arrows, wraps, and runs on Enter after closing", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    render(<CommandPalette commands={commands} onClose={onClose} />);
    const input = screen.getByTestId("command-palette-input");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByTestId("command-palette-option-automation.run.a").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getByTestId("command-palette-option-create.text").id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(commands[1].run).toHaveBeenCalledTimes(1);
  });

  it("does not run disabled commands and shows why", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    render(<CommandPalette commands={commands} onClose={onClose} />);
    const disabled = screen.getByTestId("command-palette-option-automation.run.a");
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect(disabled.textContent).toContain("Another automation is running");
    fireEvent.click(disabled);
    expect(commands[2].run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("runs a command on click", () => {
    const commands = makeCommands();
    render(<CommandPalette commands={commands} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("command-palette-option-nav.home"));
    expect(commands[0].run).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CommandPalette commands={makeCommands()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("command-palette-input"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ShortcutsDialog", () => {
  it("lists every shortcut and closes from the close button", () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog onClose={onClose} />);
    for (const item of ALL_SHORTCUTS) {
      expect(screen.getByTestId(`shortcut-${item.id}`).textContent).toContain(item.title);
    }
    fireEvent.click(screen.getByTestId("shortcuts-dialog-close"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Dialog keyboard isolation", () => {
  it("keeps editor shortcuts from leaking but lets palette shortcuts through", () => {
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(`${event.ctrlKey ? "Ctrl+" : ""}${event.key}`);
    window.addEventListener("keydown", listener);
    try {
      render(<CommandPalette commands={makeCommands()} onClose={vi.fn()} />);
      const input = screen.getByTestId("command-palette-input");
      fireEvent.keyDown(input, { key: "s", ctrlKey: true });
      fireEvent.keyDown(input, { key: "a" });
      fireEvent.keyDown(input, { key: "k", ctrlKey: true });
      fireEvent.keyDown(input, { key: "/", ctrlKey: true });
      expect(seen).toEqual(["Ctrl+k", "Ctrl+/"]);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});
