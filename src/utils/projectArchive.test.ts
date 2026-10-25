import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  selectArchiveSavePath: vi.fn(),
  exportProject: vi.fn(),
  importProject: vi.fn(),
}));
const store = vi.hoisted(() => ({
  state: { projectPath: "C:/demos/my demo" as string | null, projectName: "My: Demo" as string | null, openProject: vi.fn() },
}));
vi.mock("../services", () => ({ getBackend: () => backend }));
vi.mock("../stores/projectStore", () => ({ useProjectStore: { getState: () => store.state } }));

const { archiveFileName, describeArchive, exportOpenProject, importProjectArchive } = await import("./projectArchive");

beforeEach(() => {
  store.state.projectPath = "C:/demos/my demo";
  store.state.projectName = "My: Demo";
});
afterEach(() => vi.clearAllMocks());

describe("archiveFileName", () => {
  it("makes a filesystem-safe name", () => {
    expect(archiveFileName("My: Demo / v2")).toBe("My-Demo-v2.snipsy.zip");
    expect(archiveFileName("  ")).toBe("snipsy-project.snipsy.zip");
    expect(archiveFileName(null)).toBe("snipsy-project.snipsy.zip");
  });
});

describe("describeArchive", () => {
  it("pluralizes the file count", () => {
    expect(describeArchive({ path: "C:/a.zip", fileCount: 1 })).toBe("1 file · C:/a.zip");
    expect(describeArchive({ path: "C:/a.zip", fileCount: 4 })).toBe("4 files · C:/a.zip");
  });
});

describe("exportOpenProject", () => {
  it("asks for a path then exports the open project", async () => {
    backend.selectArchiveSavePath.mockResolvedValue("C:/out/demo.zip");
    backend.exportProject.mockResolvedValue({ path: "C:/out/demo.zip", fileCount: 5 });
    const onStart = vi.fn();
    await expect(exportOpenProject(onStart)).resolves.toEqual({ path: "C:/out/demo.zip", fileCount: 5 });
    expect(backend.selectArchiveSavePath).toHaveBeenCalledWith("My-Demo.snipsy.zip");
    expect(onStart).toHaveBeenCalledWith("C:/out/demo.zip");
    expect(backend.exportProject).toHaveBeenCalledWith("C:/demos/my demo", "C:/out/demo.zip");
  });

  it("returns null when the save dialog is cancelled", async () => {
    backend.selectArchiveSavePath.mockResolvedValue(null);
    const onStart = vi.fn();
    await expect(exportOpenProject(onStart)).resolves.toBeNull();
    expect(onStart).not.toHaveBeenCalled();
    expect(backend.exportProject).not.toHaveBeenCalled();
  });

  it("fails without an open project", async () => {
    store.state.projectPath = null;
    await expect(exportOpenProject()).rejects.toThrow("No project is open.");
  });
});

describe("importProjectArchive", () => {
  it("imports then opens the extracted project", async () => {
    backend.importProject.mockResolvedValue({ path: "C:/imported", fileCount: 3 });
    await importProjectArchive("C:/demo.zip", "C:/imported");
    expect(backend.importProject).toHaveBeenCalledWith("C:/demo.zip", "C:/imported");
    expect(store.state.openProject).toHaveBeenCalledWith("C:/imported");
  });

  it("does not open anything when the import fails", async () => {
    backend.importProject.mockRejectedValue("Choose an empty folder to import into.");
    await expect(importProjectArchive("C:/demo.zip", "C:/full")).rejects.toBe("Choose an empty folder to import into.");
    expect(store.state.openProject).not.toHaveBeenCalled();
  });
});