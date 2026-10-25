import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Kbd from "./Kbd";
import IconButton from "./IconButton";
import StatusBadge from "./StatusBadge";
import ListRow from "./ListRow";
import EmptyState from "../EmptyState";

afterEach(cleanup);

describe("Kbd", () => {
  it("renders one keycap per key while keeping a readable text form", () => {
    render(<Kbd hotkey="CmdOrControl+Shift+1" data-testid="kbd" />);
    const kbd = screen.getByTestId("kbd");
    expect(kbd.querySelectorAll("kbd")).toHaveLength(3);
    expect(kbd.textContent).toMatch(/^(Ctrl|Command)\+Shift\+1$/);
  });

  it("shows a placeholder when no hotkey is set", () => {
    render(<Kbd hotkey="" data-testid="kbd" />);
    expect(screen.getByTestId("kbd").textContent).toBe("No hotkey");
  });
});

describe("IconButton", () => {
  it("uses its label as tooltip and accessible name", () => {
    render(<IconButton label="Close panel" icon={<span />} />);
    const button = screen.getByRole("button", { name: "Close panel" });
    expect(button.getAttribute("title")).toBe("Close panel");
  });
});

describe("StatusBadge", () => {
  it("exposes its tone for styling and tests", () => {
    render(<StatusBadge tone="danger" data-testid="badge">Conflict</StatusBadge>);
    expect(screen.getByTestId("badge").dataset.tone).toBe("danger");
  });
});

describe("EmptyState", () => {
  it("renders an optional action and tip", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Nothing" action={{ label: "Add one", onClick, testId: "add" }} tip="A tip" />);
    fireEvent.click(screen.getByTestId("add"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("A tip")).toBeTruthy();
  });
});

describe("ListRow menu", () => {
  const renderRow = () => {
    const edit = vi.fn();
    const remove = vi.fn();
    render(
      <ListRow
        menuLabel="More actions for Intro"
        menuItems={[
          { id: "edit", label: "Edit", onSelect: edit },
          { id: "disabled", label: "Disabled", onSelect: vi.fn(), disabled: true },
          { id: "delete", label: "Delete", onSelect: remove, danger: true, separated: true },
        ]}
        data-testid="row"
      >
        Intro
      </ListRow>,
    );
    return { edit, remove };
  };

  it("opens from the More button and runs the chosen item", () => {
    const { edit } = renderRow();
    const more = screen.getByRole("button", { name: "More actions for Intro" });
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toContain("Edit");
    fireEvent.click(screen.getByTestId("row-menu-edit"));
    expect(edit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on right-click", () => {
    renderRow();
    fireEvent.contextMenu(screen.getByTestId("row"), { clientX: 20, clientY: 30 });
    expect(screen.getByRole("menu", { name: "More actions for Intro" })).toBeTruthy();
  });

  it("skips disabled items with arrow keys and closes on Escape, restoring focus", () => {
    const { remove } = renderRow();
    const more = screen.getByRole("button", { name: "More actions for Intro" });
    fireEvent.click(more);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Delete");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Edit");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger after a selection and on Tab", () => {
    renderRow();
    const more = screen.getByRole("button", { name: "More actions for Intro" });
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId("row-menu-delete"));
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("closes on an outside click", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Intro" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
