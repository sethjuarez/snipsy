import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface EditorSaveState {
  canSave: boolean;
  readinessText: string;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
}

export type SaveStatusTone = "success" | "muted" | "warning" | "danger";

/** Header text and tone for an editor's save state. */
export function describeSaveState(state: EditorSaveState): { text: string; tone: SaveStatusTone } {
  if (state.saveStatus === "saving") return { text: "Saving…", tone: "muted" };
  if (state.saveStatus === "error") return { text: "Couldn't save", tone: "danger" };
  if (!state.canSave) return { text: state.readinessText, tone: "muted" };
  if (state.saveStatus === "unsaved") return { text: "Unsaved changes", tone: "warning" };
  if (state.saveStatus === "saved") return { text: "Saved", tone: "success" };
  return { text: state.readinessText, tone: "muted" };
}

/**
 * Tracks unsaved edits by comparing the editor's current values with a baseline snapshot.
 * The baseline is captured the first time `ready` is true and refreshed after a successful
 * `runSave`, so reverting an edit by hand clears the unsaved state.
 */
export function useSaveTracking(snapshot: unknown, ready = true) {
  const signature = JSON.stringify(snapshot);
  const baselineRef = useRef<string | null>(null);
  const [saveCount, setSaveCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  if (baselineRef.current === null && ready) {
    baselineRef.current = signature;
  }

  const hasUnsavedChanges = baselineRef.current !== null && signature !== baselineRef.current;
  const saveStatus: SaveStatus = saving
    ? "saving"
    : hasUnsavedChanges
      ? failed ? "error" : "unsaved"
      : saveCount > 0 ? "saved" : "idle";

  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  /** Runs one save at a time; resolves true once persisted. Edits made while saving stay unsaved. */
  const runSave = useCallback(async (save: () => Promise<void> | void): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    const savedSignature = signatureRef.current;
    setSaving(true);
    try {
      await save();
      baselineRef.current = savedSignature;
      setFailed(false);
      setSaveCount((count) => count + 1);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  return { saveStatus, hasUnsavedChanges, runSave };
}
