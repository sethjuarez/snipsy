import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createSampleProject = vi.hoisted(() => vi.fn());
vi.mock("../utils/sampleProject", () => ({ createSampleProject }));
const importProjectArchive = vi.hoisted(() => vi.fn());
vi.mock("../utils/projectArchive", () => ({ importProjectArchive }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: () => {
    throw new Error("not in Tauri");
  },
}));
vi.mock("../services", () => ({ getBackend: () => ({}) }));

const { default: Welcome } = await import("./Welcome");

afterEach(() => {
  cleanup();
  createSampleProject.mockReset();
  importProjectArchive.mockReset();
});

describe("Welcome sample project", () => {
  it("falls back to a path form outside Tauri and creates the sample", async () => {
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("sample-project"));
    await screen.findByTestId("sample-project-submit");

    fireEvent.change(screen.getByLabelText("Project Path"), { target: { value: "  C:/demo  " } });
    fireEvent.click(screen.getByTestId("sample-project-submit"));
    await waitFor(() => expect(createSampleProject).toHaveBeenCalledWith("C:/demo"));
  });

  it("shows sample creation errors", async () => {
    createSampleProject.mockRejectedValue("Folder already has a project");
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("sample-project"));
    await screen.findByTestId("sample-project-submit");
    fireEvent.change(screen.getByLabelText("Project Path"), { target: { value: "C:/demo" } });
    fireEvent.click(screen.getByTestId("sample-project-submit"));
    expect((await screen.findByTestId("error-message")).textContent).toContain("Folder already has a project");
  });
});

describe("Welcome import project", () => {
  it("falls back to a form outside Tauri and imports into the chosen folder", async () => {
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("import-project"));
    await screen.findByTestId("import-project-submit");

    fireEvent.change(screen.getByLabelText("Archive Path"), { target: { value: " C:/demo.snipsy.zip " } });
    fireEvent.change(screen.getByLabelText("Empty Destination Folder"), { target: { value: "C:/imported" } });
    fireEvent.click(screen.getByTestId("import-project-submit"));
    await waitFor(() => expect(importProjectArchive).toHaveBeenCalledWith("C:/demo.snipsy.zip", "C:/imported"));
  });

  it("needs both paths before importing", async () => {
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("import-project"));
    await screen.findByTestId("import-project-submit");
    fireEvent.change(screen.getByLabelText("Archive Path"), { target: { value: "C:/demo.zip" } });
    fireEvent.click(screen.getByTestId("import-project-submit"));
    expect(importProjectArchive).not.toHaveBeenCalled();
  });

  it("shows import errors", async () => {
    importProjectArchive.mockRejectedValue("Choose an empty folder to import into.");
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("import-project"));
    await screen.findByTestId("import-project-submit");
    fireEvent.change(screen.getByLabelText("Archive Path"), { target: { value: "C:/demo.zip" } });
    fireEvent.change(screen.getByLabelText("Empty Destination Folder"), { target: { value: "C:/full" } });
    fireEvent.click(screen.getByTestId("import-project-submit"));
    expect((await screen.findByTestId("error-message")).textContent).toContain("empty folder");
  });
});
