import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectImage, TextSnippet } from "../types";

const backend = vi.hoisted(() => ({
  selectImageFile: vi.fn(),
  importImage: vi.fn(),
  importImageData: vi.fn(),
}));
vi.mock("../services", () => ({ getBackend: () => backend }));

const { default: TextSnippetForm } = await import("./TextSnippetForm");

const image = (key: string): ProjectImage => ({ key, absolutePath: `C:/p/images/${key}`, width: 1, height: 1, bytes: 1 });
const base: TextSnippet = { id: "s", title: "Intro Slide", description: "", text: "ab", hotkey: "", delivery: "fast-type" };
const textArea = () => screen.getByTestId("snippet-text") as HTMLTextAreaElement;
const problem = () => screen.queryByTestId("snippet-image-problem")?.textContent ?? null;

const renderForm = (props: Partial<Parameters<typeof TextSnippetForm>[0]> = {}, snippet: TextSnippet = base) =>
  render(<TextSnippetForm snippet={snippet} onSave={vi.fn()} projectPath="C:/p" availableImageKeys={new Set(["logo.png"])} {...props} />);

const placeCursor = (at: number) => {
  textArea().focus();
  textArea().setSelectionRange(at, at);
};

beforeEach(() => {
  for (const fn of Object.values(backend)) fn.mockReset();
});
afterEach(cleanup);

describe("TextSnippetForm images", () => {
  it("hides image tools without a project", () => {
    renderForm({ projectPath: null });
    expect(screen.queryByTestId("snippet-insert-image")).toBeNull();
    expect(screen.queryByTestId("snippet-import-image")).toBeNull();
  });

  it("flags malformed, missing, and paste-mode references", () => {
    renderForm({}, { ...base, text: "{{image:logo.png" });
    expect(problem()).toBe("Unclosed image reference: add }} after {{image:");

    fireEvent.change(textArea(), { target: { value: "{{image:gone.png}}" } });
    expect(problem()).toBe("Missing image: gone.png");

    fireEvent.change(textArea(), { target: { value: "{{image:logo.png}}" } });
    expect(problem()).toBeNull();

    fireEvent.click(screen.getByTestId("delivery-paste"));
    expect(problem()).toBe("Images only work with Fast-type delivery.");
  });

  it("inserts a picked image at the cursor", () => {
    renderForm();
    placeCursor(1);
    fireEvent.change(screen.getByTestId("snippet-insert-image"), { target: { value: "logo.png" } });
    expect(textArea().value).toBe("a{{image:logo.png}}b");
  });

  it("imports a file and inserts its reference", async () => {
    backend.selectImageFile.mockResolvedValue("D:/pics/chart.png");
    backend.importImage.mockResolvedValue(image("chart.png"));
    const onImageImported = vi.fn();
    renderForm({ onImageImported });
    placeCursor(2);

    fireEvent.click(screen.getByTestId("snippet-import-image"));
    await waitFor(() => expect(textArea().value).toBe("ab{{image:chart.png}}"));
    expect(backend.importImage).toHaveBeenCalledWith("C:/p", "D:/pics/chart.png");
    expect(onImageImported).toHaveBeenCalledWith("chart.png");
  });

  it("reports import failures without changing the text", async () => {
    backend.selectImageFile.mockResolvedValue("D:/pics/huge.png");
    backend.importImage.mockRejectedValue("Image is too large");
    const onError = vi.fn();
    renderForm({ onError });

    fireEvent.click(screen.getByTestId("snippet-import-image"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Could not add image", "Image is too large"));
    expect(textArea().value).toBe("ab");
  });

  it("ingests a pasted image, naming generic screenshots after the title", async () => {
    backend.importImageData.mockResolvedValue(image("intro-slide.png"));
    renderForm();
    placeCursor(1);

    const file = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    fireEvent.paste(textArea(), { clipboardData: { files: [file] } });

    await waitFor(() => expect(textArea().value).toBe("a{{image:intro-slide.png}}b"));
    expect(backend.importImageData).toHaveBeenCalledWith("C:/p", "Intro Slide", "AQID");
  });

  it("leaves non-image pastes to the browser", () => {
    renderForm();
    const event = fireEvent.paste(textArea(), { clipboardData: { files: [] } });
    expect(event).toBe(true);
    expect(backend.importImageData).not.toHaveBeenCalled();
  });
});