import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "unsaved" | "saved";

export interface EditorSaveState {
  canSave: boolean;
  readinessText: string;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
}

/**
 * Tracks unsaved edits by comparing the editor's current values with a baseline snapshot.
 * The baseline is captured the first time `ready` is true and refreshed by `markSaved`,
 * so reverting an edit by hand clears the unsaved state.
 */
export function useSaveTracking(snapshot: unknown, ready = true) {
  const signature = JSON.stringify(snapshot);
  const baselineRef = useRef<string | null>(null);
  const [saveCount, setSaveCount] = useState(0);

  if (baselineRef.current === null && ready) {
    baselineRef.current = signature;
  }

  const hasUnsavedChanges = baselineRef.current !== null && signature !== baselineRef.current;
  const saveStatus: SaveStatus = hasUnsavedChanges ? "unsaved" : saveCount > 0 ? "saved" : "idle";

  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const markSaved = useCallback(() => {
    baselineRef.current = signatureRef.current;
    setSaveCount((count) => count + 1);
  }, []);

  return { saveStatus, hasUnsavedChanges, markSaved };
}
