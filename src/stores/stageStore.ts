import { create } from "zustand";
import { getBackend } from "../services";
import { auditaurListen, isTauriRuntime } from "../services/auditaur";
import type { StageReport, StageStatus } from "../types";

interface StageStoreState {
  /** `null` until the first status arrives. */
  status: StageStatus | null;
  busy: boolean;
  refresh: () => Promise<void>;
  stage: (projectPath: string) => Promise<StageReport>;
  unstage: () => Promise<StageReport>;
  /** Apply a status pushed by the backend (tray Unstage, other windows). */
  receive: (status: StageStatus) => void;
}

/** Machine-wide Stage status. Not tied to the open project. */
export const useStageStore = create<StageStoreState>((set, get) => {
  // Responses and events can arrive out of order; keep the newest snapshot.
  const accept = (status: StageStatus) => {
    const current = get().status;
    if (!current || status.revision >= current.revision) set({ status });
  };
  const run = async (op: () => Promise<StageReport>) => {
    set({ busy: true });
    try {
      const report = await op();
      accept(report.status);
      return report;
    } catch (error) {
      // The backend may have changed state before failing.
      getBackend().getStageStatus().then(accept).catch(() => {});
      throw error;
    } finally {
      set({ busy: false });
    }
  };
  return {
    status: null,
    busy: false,
    refresh: async () => {
      accept(await getBackend().getStageStatus());
    },
    stage: (projectPath) => run(() => getBackend().stageProject(projectPath)),
    unstage: () => run(() => getBackend().unstage()),
    receive: accept,
  };
});

/** Subscribe to backend Stage updates. Returns an unsubscribe function. */
export function listenForStageChanges(): () => void {
  if (!isTauriRuntime()) return () => {};
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  auditaurListen<StageStatus>("stage-changed", (event) => useStageStore.getState().receive(event.payload))
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    })
    .catch((error: unknown) => console.warn("Failed to listen for Stage changes", error));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Short summary of a Stage/Unstage report for a toast. */
export function describeStageReport(report: StageReport): { title: string; detail?: string; tone: "success" | "warning" } {
  const details: string[] = [];
  if (report.fixed.length) details.push(`Re-applied: ${report.fixed.join(", ")}.`);
  if (report.conflicts.length) details.push(`Kept your current value for: ${report.conflicts.join(", ")}.`);
  if (report.failures.length) details.push(report.failures.join(" "));
  if (report.configChanged) details.push("Stage settings changed since you staged. They apply the next time you Stage.");
  const detail = details.join(" ") || undefined;
  switch (report.outcome) {
    case "staged":
      return { title: "Staged", detail, tone: "success" };
    case "alreadyStaged":
      return { title: report.fixed.length ? "Staged again" : "Already staged", detail, tone: "success" };
    case "degraded":
      return { title: "Staged with problems", detail, tone: "warning" };
    case "unstaged":
      return { title: "Unstaged", detail, tone: report.conflicts.length ? "warning" : "success" };
    case "notStaged":
      return { title: "Nothing to Unstage", detail, tone: "success" };
    case "unstageIncomplete":
      return { title: "Unstage didn't finish", detail: detail ?? "Run Unstage again.", tone: "warning" };
  }
}
