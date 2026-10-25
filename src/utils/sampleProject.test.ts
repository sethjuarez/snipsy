import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectHotkeyOwners, hotkeyProblem } from "./hotkeys";

const backend = vi.hoisted(() => ({
  createProject: vi.fn(),
  openProject: vi.fn(),
  loadAutomations: vi.fn(),
  saveTextSnippets: vi.fn(),
  saveAutomation: vi.fn(),
  enterDemoMode: vi.fn(),
  isDemoMode: vi.fn(),
  setStreamDeckActiveProject: vi.fn(),
}));

vi.mock("../services", () => ({ getBackend: () => backend }));

const { useProjectStore } = await import("../stores/projectStore");
const { createSampleProject, sampleAutomation, sampleTextSnippets, SAMPLE_PROJECT_NAME } = await import("./sampleProject");

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(backend)) fn.mockReset().mockResolvedValue(undefined);
  backend.createProject.mockImplementation(async (_path: string, name: string, description: string) => ({
    project: { name, description },
    textSnippets: [],
    videoSnippets: [],
  }));
  backend.isDemoMode.mockResolvedValue(false);
  backend.openProject.mockImplementation(async () => ({
    project: { name: SAMPLE_PROJECT_NAME, description: "" },
    textSnippets: backend.saveTextSnippets.mock.calls[0][1],
    videoSnippets: [],
  }));
  backend.loadAutomations.mockImplementation(async () => [backend.saveAutomation.mock.calls[0][1]]);
  useProjectStore.setState({ projectPath: null, projectName: null, textSnippets: [], automations: [] });
});

describe("sample project", () => {
  it("ships conflict-free hotkeys", () => {
    const texts = sampleTextSnippets();
    const automation = sampleAutomation();
    const owners = collectHotkeyOwners(texts, [], [automation]);
    for (const item of [...texts, automation]) {
      expect(hotkeyProblem(item.hotkey, owners, item.id)).toBeNull();
    }
    expect(automation.contributionGroups?.[0].contributions[0].url).toMatch(/^https:\/\//);
  });

  it("creates the project and saves its examples", async () => {
    await createSampleProject("C:/demo");

    expect(backend.createProject).toHaveBeenCalledWith("C:/demo", SAMPLE_PROJECT_NAME, expect.any(String));
    expect(backend.saveTextSnippets).toHaveBeenCalledWith("C:/demo", expect.arrayContaining([expect.objectContaining({ title: "Say hello" })]));
    expect(backend.saveAutomation).toHaveBeenCalledWith("C:/demo", expect.objectContaining({ title: "Open the docs" }));
    const state = useProjectStore.getState();
    expect(state.projectName).toBe(SAMPLE_PROJECT_NAME);
    expect(state.textSnippets).toHaveLength(2);
    expect(state.automations).toHaveLength(1);
    expect(backend.openProject.mock.invocationCallOrder[0]).toBeGreaterThan(backend.saveAutomation.mock.invocationCallOrder[0]);
  });

  it("stays on the welcome screen when writing examples fails", async () => {
    backend.saveTextSnippets.mockRejectedValue("disk full");
    await expect(createSampleProject("C:/demo")).rejects.toBe("disk full");
    expect(backend.openProject).not.toHaveBeenCalled();
    expect(useProjectStore.getState().projectPath).toBeNull();
  });
});
