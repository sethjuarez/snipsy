import { getBackend } from "../services";
import { useProjectStore } from "../stores/projectStore";
import type { ArchiveSummary } from "../types";

/** A filesystem-safe archive name like `My-Demo.snipsy.zip`. */
export function archiveFileName(projectName: string | null | undefined): string {
  const base = (projectName ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return `${base || "snipsy-project"}.snipsy.zip`;
}

export function describeArchive(summary: ArchiveSummary): string {
  const files = `${summary.fileCount} ${summary.fileCount === 1 ? "file" : "files"}`;
  return `${files} · ${summary.path}`;
}

/** Ask for a destination, then zip the open project. Returns null when cancelled. */
export async function exportOpenProject(onStart?: (archivePath: string) => void): Promise<ArchiveSummary | null> {
  const { projectPath, projectName } = useProjectStore.getState();
  if (!projectPath) throw new Error("No project is open.");
  const backend = getBackend();
  const archivePath = await backend.selectArchiveSavePath(archiveFileName(projectName));
  if (!archivePath) return null;
  onStart?.(archivePath);
  return backend.exportProject(projectPath, archivePath);
}

/** Unzip an archive into an empty folder and open it. */
export async function importProjectArchive(archivePath: string, destinationPath: string): Promise<ArchiveSummary> {
  const summary = await getBackend().importProject(archivePath, destinationPath);
  await useProjectStore.getState().openProject(summary.path);
  return summary;
}
