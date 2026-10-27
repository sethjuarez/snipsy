import { beforeEach, describe, expect, it, vi } from "vitest";
import { TauriBackendService } from "./tauriBackendService";

const { invoke, untracedInvoke, open } = vi.hoisted(() => ({
  invoke: vi.fn(),
  untracedInvoke: vi.fn(),
  open: vi.fn(),
}));

vi.mock("./auditaur", () => ({ auditaurInvoke: invoke, untracedInvoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

describe("TauriBackendService images", () => {
  beforeEach(() => {
    invoke.mockReset();
    untracedInvoke.mockReset();
    open.mockReset();
  });

  // Tauri maps these camelCase names onto the Rust command parameters.
  it("calls the image commands with their argument names", async () => {
    const backend = new TauriBackendService();
    invoke.mockResolvedValue(undefined);

    await backend.importImage("C:/demo", "C:/shots/logo.png");
    await backend.listProjectImages("C:/demo");
    await backend.deleteProjectImage("C:/demo", "logo.png");

    expect(invoke.mock.calls).toEqual([
      ["import_image", { projectPath: "C:/demo", sourceFilePath: "C:/shots/logo.png" }],
      ["list_project_images", { projectPath: "C:/demo" }],
      ["delete_project_image", { projectPath: "C:/demo", key: "logo.png" }],
    ]);
  });

  it("passes the project path so text delivery can load images", async () => {
    const backend = new TauriBackendService();
    invoke.mockResolvedValue(undefined);

    await backend.deliverText("a {{image:logo.png}}", "fast-type", 10, 2, 30, "C:/demo");

    expect(invoke).toHaveBeenCalledWith("deliver_text", {
      text: "a {{image:logo.png}}",
      method: "fast-type",
      typeDelay: 10,
      typoChance: 2,
      typeVariation: 30,
      projectPath: "C:/demo",
    });
  });

  // Auditaur's frontend span would otherwise store the image bytes in telemetry.
  it("keeps pasted image bytes out of the traced invoke", async () => {
    untracedInvoke.mockResolvedValue(undefined);

    await new TauriBackendService().importImageData("C:/demo", "Pasted image", "iVBORw0KGgo");

    expect(untracedInvoke.mock.calls).toEqual([
      ["import_image_data", { projectPath: "C:/demo", name: "Pasted image", dataBase64: "iVBORw0KGgo" }],
    ]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns the image the backend stored", async () => {
    const image = { key: "logo.png", absolutePath: "C:/demo/images/logo.png", width: 2, height: 1, bytes: 70 };
    invoke.mockResolvedValue(image);

    await expect(new TauriBackendService().importImage("C:/demo", "C:/shots/logo.png")).resolves.toEqual(image);
  });

  it("asks for a single PNG or JPEG file", async () => {
    open.mockResolvedValue("C:/shots/logo.png");

    await expect(new TauriBackendService().selectImageFile()).resolves.toBe("C:/shots/logo.png");
    expect(open).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
    });
  });

  it("returns null when the file dialog is cancelled", async () => {
    open.mockResolvedValue(null);

    await expect(new TauriBackendService().selectImageFile()).resolves.toBeNull();
  });
});
