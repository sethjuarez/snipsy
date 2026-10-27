import { describe, expect, it } from "vitest";
import { MockBackendService } from "./mockBackendService";
import slugCases from "../../tests/fixtures/image-slugs.json";

// The mock only sniffs base64 signatures, so short stand-ins are enough.
const PNG_A = "iVBORw0KGgoAAAA";
const PNG_B = "iVBORw0KGgoBBBB";
const JPEG = "/9j/4AAQSkZJRg";

describe("MockBackendService images", () => {
  it("names images like the backend (shared slug fixture)", async () => {
    expect(slugCases.length).toBeGreaterThan(0);
    for (const { name, slug } of slugCases) {
      const backend = new MockBackendService();
      expect((await backend.importImageData("/p", name, PNG_A)).key, name).toBe(`${slug}.png`);
    }
  });
  it("imports images under portable keys and lists them sorted", async () => {
    const backend = new MockBackendService();

    const logo = await backend.importImage("/p", "C:\\shots\\Team Logo.PNG");
    const shot = await backend.importImageData("/p", "Screenshot 10.30.12", JPEG);

    expect(logo).toEqual({
      key: "team-logo.png",
      absolutePath: "/mock/project/images/team-logo.png",
      width: 640,
      height: 360,
      bytes: 2048,
    });
    expect(shot.key).toBe("screenshot-10-30-12.jpg");
    expect((await backend.listProjectImages("/p")).map((image) => image.key)).toEqual([
      "screenshot-10-30-12.jpg",
      "team-logo.png",
    ]);
  });

  it("reuses identical sources and suffixes name clashes", async () => {
    const backend = new MockBackendService();

    const first = await backend.importImageData("/p", "logo.png", PNG_A);
    expect(await backend.importImageData("/p", "brand.png", PNG_A)).toEqual(first);
    expect((await backend.importImageData("/p", "logo.png", PNG_B)).key).toBe("logo-2.png");
    expect((await backend.importImage("/p", "/shots/logo.png")).key).toBe("logo-3.png");
    expect((await backend.importImage("/p", "/shots/logo.png")).key).toBe("logo-3.png");
    expect(await backend.listProjectImages("/p")).toHaveLength(3);
  });

  it("rejects formats other than PNG and JPEG", async () => {
    const backend = new MockBackendService();

    await expect(backend.importImageData("/p", "anim.gif", "R0lGODlh")).rejects.toThrow(
      "Only PNG and JPEG images are supported.",
    );
    await expect(backend.importImage("/p", "/shots/anim.gif")).rejects.toThrow("Only PNG and JPEG");
    expect(await backend.listProjectImages("/p")).toEqual([]);
  });

  it("deletes images by key and forgets their source", async () => {
    const backend = new MockBackendService();
    const logo = await backend.importImageData("/p", "logo.png", PNG_A);

    await backend.deleteProjectImage("/p", logo.key);

    expect(await backend.listProjectImages("/p")).toEqual([]);
    await expect(backend.deleteProjectImage("/p", logo.key)).rejects.toThrow("Image not found: logo.png");
    expect(await backend.importImageData("/p", "logo.png", PNG_A)).toEqual(logo);
  });

  it("offers a mock image file to import", async () => {
    const backend = new MockBackendService();

    const path = await backend.selectImageFile();

    expect(path).toBe("/mock/images/mock-image-1.png");
    expect((await backend.importImage("/p", path!)).key).toBe("mock-image-1.png");
  });

  it("counts images in project exports", async () => {
    const backend = new MockBackendService();
    const before = await backend.exportProject("/p", "/out/before.zip");

    await backend.importImageData("/p", "logo.png", PNG_A);
    const after = await backend.exportProject("/p", "/out/after.zip");

    expect(after.fileCount).toBe(before.fileCount + 1);
  });

  it("restores images from an exported project", async () => {
    const backend = new MockBackendService();
    const logo = await backend.importImageData("/p", "logo.png", PNG_A);
    await backend.exportProject("/p", "/out/demo.zip");
    await backend.deleteProjectImage("/p", logo.key);

    await backend.importProject("/out/demo.zip", "/q");

    expect(await backend.listProjectImages("/q")).toEqual([logo]);
    expect(await backend.importImageData("/q", "brand.png", PNG_A)).toEqual(logo);
  });

  it("starts new projects without images", async () => {
    const backend = new MockBackendService();
    await backend.importImageData("/p", "logo.png", PNG_A);

    await backend.createProject("/q", "Fresh", "");

    expect(await backend.listProjectImages("/q")).toEqual([]);
    expect((await backend.importImageData("/q", "brand.png", PNG_A)).key).toBe("brand.png");
  });
});
