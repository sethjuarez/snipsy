import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectImage, TextSnippet } from "../types";

const backend = vi.hoisted(() => ({
  listProjectImages: vi.fn(),
  selectImageFile: vi.fn(),
  importImage: vi.fn(),
  deleteProjectImage: vi.fn(),
}));

vi.mock("../services", () => ({ getBackend: () => backend }));
vi.mock("../services/auditaur", () => ({
  isTauriRuntime: () => true,
  tauriFileSrc: (file: string) => `asset://${file}`,
}));

const { default: ImageList } = await import("./ImageList");

const image = (key: string): ProjectImage => ({ key, absolutePath: `C:/p/images/${key}`, width: 640, height: 480, bytes: 2048 });
const snippet = (title: string, text: string): TextSnippet => ({ id: title, title, description: "", text, hotkey: "", delivery: "fast-type" });

beforeEach(() => {
  for (const fn of Object.values(backend)) fn.mockReset();
});
afterEach(cleanup);

describe("ImageList", () => {
  it("lists images with their reference, size, usage, and thumbnail", async () => {
    backend.listProjectImages.mockResolvedValue([image("logo.png")]);
    const onImagesChange = vi.fn();
    render(<ImageList projectPath="C:/p" textSnippets={[snippet("Intro", "a {{image:logo.png}} b {{image:logo.png}}"), snippet("Other", "x")]} onImagesChange={onImagesChange} />);

    await waitFor(() => expect(screen.getByTestId("image-key-0").textContent).toBe("{{image:logo.png}}"));
    expect(screen.getByTestId("image-item-0").textContent).toMatch(/640×480 · 2 KB · +1 snippet\b/);
    expect(screen.getByAltText("logo.png").getAttribute("src")).toBe("asset://C:/p/images/logo.png");
    expect(onImagesChange).toHaveBeenLastCalledWith(["logo.png"]);
  });

  it("shows an empty state", async () => {
    backend.listProjectImages.mockResolvedValue([]);
    render(<ImageList projectPath="C:/p" textSnippets={[]} />);
    await waitFor(() => expect(screen.getByTestId("no-images")).toBeTruthy());
  });

  it("imports through the handle and reports failures", async () => {
    backend.listProjectImages.mockResolvedValueOnce([]).mockResolvedValue([image("new.png")]);
    backend.selectImageFile.mockResolvedValue("D:/pics/new.png");
    backend.importImage.mockResolvedValue(image("new.png"));
    const ref = { current: null as null | { importImage: () => void } };
    const onError = vi.fn();
    render(<ImageList ref={ref} projectPath="C:/p" textSnippets={[]} onError={onError} />);
    await waitFor(() => expect(screen.getByTestId("no-images")).toBeTruthy());

    ref.current?.importImage();
    await waitFor(() => expect(screen.getByTestId("image-key-0").textContent).toBe("{{image:new.png}}"));
    expect(backend.importImage).toHaveBeenCalledWith("C:/p", "D:/pics/new.png");

    backend.importImage.mockRejectedValue("Not a PNG or JPEG image");
    ref.current?.importImage();
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Could not import image", "Not a PNG or JPEG image"));
  });

  it("copies the reference token", async () => {
    backend.listProjectImages.mockResolvedValue([image("logo.png")]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onCopied = vi.fn();
    render(<ImageList projectPath="C:/p" textSnippets={[]} onCopied={onCopied} />);

    fireEvent.click(await screen.findByTestId("copy-image-ref-0"));
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith("{{image:logo.png}}"));
    expect(writeText).toHaveBeenCalledWith("{{image:logo.png}}");
  });

  it("warns which snippets use an image before deleting it", async () => {
    backend.listProjectImages.mockResolvedValueOnce([image("logo.png")]).mockResolvedValue([]);
    backend.deleteProjectImage.mockResolvedValue(undefined);
    render(<ImageList projectPath="C:/p" textSnippets={[snippet("Intro", "{{image:logo.png}}")]} />);

    fireEvent.click(await screen.findByTestId("delete-image-0"));
    const dialog = screen.getByTestId("delete-image-dialog");
    expect(within(dialog).getByText(/still reference it/).textContent).toContain("Intro");

    fireEvent.click(screen.getByTestId("confirm-delete-image"));
    await waitFor(() => expect(screen.getByTestId("no-images")).toBeTruthy());
    expect(backend.deleteProjectImage).toHaveBeenCalledWith("C:/p", "logo.png");
    expect(screen.queryByTestId("delete-image-dialog")).toBeNull();
  });
});