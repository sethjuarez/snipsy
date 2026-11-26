import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StageView from "./StageView";
import { MockBackendService } from "../services/mockBackendService";
import type { StageStatus } from "../types";

afterEach(cleanup);

const status = (patch: Partial<StageStatus> = {}): StageStatus => ({
  supported: true,
  backend: "fake",
  state: "notStaged",
  projectPath: null,
  projectName: null,
  stagedAt: null,
  config: null,
  keepAwake: { requested: false, active: false },
  settings: [],
  recovered: false,
  error: null,
  ...patch,
});

const noop = () => {};

describe("StageView", () => {
  it("saves toggles and only allows Stage once a setting is saved", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StageView projectPath="/p" config={null} status={status()} busy={false} onSave={onSave} onStage={noop} onUnstage={noop} />);
    expect((screen.getByTestId("stage-button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("unstage-button") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("stage-mouse-sonar"));
    fireEvent.click(screen.getByTestId("stage-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ shared: { keepAwake: false }, windows: { mouseSonar: true } }));
  });

  it("blocks staging a second project and shows Windows-only elsewhere", () => {
    const config = { shared: { keepAwake: true }, windows: { mouseSonar: false } };
    const { rerender } = render(
      <StageView projectPath="/p" config={config} status={status({ state: "staged", projectPath: "/other", projectName: "Other" })} busy={false} onSave={vi.fn()} onStage={noop} onUnstage={noop} />,
    );
    expect(screen.getByTestId("stage-elsewhere").textContent).toContain("Other");
    expect((screen.getByTestId("stage-button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("unstage-button") as HTMLButtonElement).disabled).toBe(false);

    rerender(<StageView projectPath="/p" config={config} status={status({ supported: false, backend: "unsupported" })} busy={false} onSave={vi.fn()} onStage={noop} onUnstage={noop} />);
    expect(screen.getByTestId("stage-unsupported").textContent).toBe("Stage is Windows-only for now.");
  });
});

describe("MockBackendService Stage", () => {
  it("stages one project at a time and Unstage is a no-op when unstaged", async () => {
    const backend = new MockBackendService();
    const project = await backend.saveProjectStage("/p", { shared: { keepAwake: true }, windows: { mouseSonar: true } });
    expect(project.stage?.windows.mouseSonar).toBe(true);

    expect((await backend.unstage()).outcome).toBe("notStaged");
    expect((await backend.stageProject("/p")).outcome).toBe("staged");
    expect((await backend.stageProject("/p")).outcome).toBe("alreadyStaged");
    await expect(backend.stageProject("/other")).rejects.toThrow(/Unstage it first/);
    expect((await backend.unstage()).status.state).toBe("notStaged");
  });
});
