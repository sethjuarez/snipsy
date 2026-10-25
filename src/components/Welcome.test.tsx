import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createSampleProject = vi.hoisted(() => vi.fn());
vi.mock("../utils/sampleProject", () => ({ createSampleProject }));
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
