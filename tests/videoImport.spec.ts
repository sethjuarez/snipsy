import { test, expect } from "@playwright/test";

test.describe("Video Import", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    // Navigate to Videos view
    await page.getByTestId("nav-videos").click();
  });

  test("shows video cards from mock data", async ({ page }) => {
    await expect(page.getByTestId("video-list")).toBeVisible();
    await expect(page.getByTestId("video-item-0")).toContainText(
      "build-process.mp4",
    );
    await expect(page.getByTestId("video-item-1")).toContainText(
      "deploy-demo.mp4",
    );
  });

  test("shows import video button", async ({ page }) => {
    await expect(page.getByTestId("import-video")).toBeVisible();
    await expect(page.getByTestId("import-video")).toContainText(
      "Import Video",
    );
  });

  test("can import a video", async ({ page }) => {
    const initialItems = await page.getByTestId("video-list").locator("[data-testid^='video-item-']").count();
    await page.getByTestId("import-video").click();
    await expect(
      page.getByTestId("video-list").locator("[data-testid^='video-item-']"),
    ).toHaveCount(initialItems + 1);
  });

  test("shows create clip button on each video card", async ({ page }) => {
    await expect(page.getByTestId("create-clip-0")).toBeVisible();
    await expect(page.getByTestId("create-clip-0")).toContainText("Create Clip");
  });

  test("clicking create clip opens clip editor", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    await expect(page.getByTestId("clip-title")).toBeVisible();
    await expect(page.getByTestId("clip-hotkey")).toBeVisible();
    await expect(page.getByTestId("clip-save")).toBeVisible();
  });

  test("clip editor shows monitor selector with available monitors", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    const select = page.getByTestId("clip-monitor");
    await expect(select).toBeVisible();
    // Mock provides 2 monitors
    const options = select.locator("option");
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText("Primary Monitor");
    await expect(options.nth(1)).toContainText("Secondary Monitor");
  });

  test("clip editor shows end behavior selector defaulting to close", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    const select = page.getByTestId("clip-end-behavior");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("close");
    // Can switch to freeze
    await select.selectOption("freeze");
    await expect(select).toHaveValue("freeze");
  });

  test("clip editor shows hide cursor checkbox defaulting to checked", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    const checkbox = page.getByTestId("clip-hide-cursor");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
    // Can uncheck
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test("clip editor shows click-to-play checkbox defaulting to unchecked", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    const checkbox = page.getByTestId("clip-click-to-play");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    // Can check
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  test("clip editor shows mute audio checkbox defaulting to checked", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    const checkbox = page.getByTestId("clip-muted");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
    // Can uncheck
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test("clip editor can add and remove pause stops", async ({ page }) => {
    await page.getByTestId("nav-video-snippets").click();
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();

    await page.getByTestId("clip-editor-video").evaluate((node) => {
      const video = node as HTMLVideoElement;
      video.currentTime = 15;
      video.dispatchEvent(new Event("timeupdate"));
    });
    await page.getByTestId("add-pause-stop").click();
    await expect(page.getByTestId("pause-stop-1")).toBeVisible();
    await page.getByTestId("pause-stop-label-1").fill("Presenter checkpoint");
    await page.getByTestId("remove-pause-stop-1").click();
    await expect(page.getByTestId("pause-stop-1")).not.toBeVisible();
  });

  test("clip editor can frame-step the playhead without moving clip bounds", async ({ page }) => {
    await page.getByTestId("nav-video-snippets").click();
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();

    await expect(page.getByTestId("add-pause-stop")).toBeDisabled();
    await expect(page.getByTestId("frame-back-playhead")).toBeDisabled();
    await expect(page.getByTestId("frame-fwd-playhead")).toBeEnabled();
    await expect(page.getByTestId("playhead-time")).toBeVisible();
    const playheadBefore = await page.getByTestId("playhead-time").textContent();
    const startBefore = await page.getByTestId("clip-start").getAttribute("style");
    const endBefore = await page.getByTestId("clip-end").getAttribute("style");

    await page.getByTestId("frame-fwd-playhead").click();

    await expect(page.getByTestId("add-pause-stop")).toBeEnabled();
    await expect(page.getByTestId("frame-back-playhead")).toBeEnabled();
    await expect(page.getByTestId("playhead-time")).not.toHaveText(playheadBefore ?? "");
    await expect(page.getByTestId("clip-start")).toHaveAttribute("style", startBefore ?? "");
    await expect(page.getByTestId("clip-end")).toHaveAttribute("style", endBefore ?? "");
    await page.getByTestId("add-pause-stop").click();
    await expect(page.getByTestId("pause-stop-1")).toBeVisible();
  });

  test("clip editor can draw and clear a spotlight region for a pause stop", async ({ page }) => {
    await page.getByTestId("nav-video-snippets").click();
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();

    await page.getByTestId("pause-stop-spotlight-0").click();
    const surface = page.getByTestId("spotlight-editor-surface");
    await expect(surface).toBeVisible();

    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + 80, box.y + 70);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 170);
    await page.mouse.up();

    await expect(page.getByTestId("editor-spotlight-region-1")).toBeVisible();
    await expect(page.getByTestId("editor-spotlight-resize-se-1")).toBeVisible();
    const regionBeforeResize = await page.getByTestId("editor-spotlight-region-1").boundingBox();
    const resizeHandle = await page.getByTestId("editor-spotlight-resize-se-1").boundingBox();
    expect(regionBeforeResize).not.toBeNull();
    expect(resizeHandle).not.toBeNull();
    if (!regionBeforeResize || !resizeHandle) return;
    await page.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + resizeHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeHandle.x + resizeHandle.width / 2 + 45, resizeHandle.y + resizeHandle.height / 2 + 25);
    await page.mouse.up();
    const regionAfterResize = await page.getByTestId("editor-spotlight-region-1").boundingBox();
    expect(regionAfterResize).not.toBeNull();
    expect(regionAfterResize?.width).toBeGreaterThan(regionBeforeResize.width);
    await expect(page.getByTestId("editor-spotlight-outside-blur")).not.toBeVisible();
    await expect(page.getByTestId("spotlight-color")).toHaveValue("#facc15");
    await page.getByTestId("spotlight-color-preset-1").click();
    await expect(page.getByTestId("spotlight-color")).toHaveValue("#38bdf8");
    await expect(page.getByTestId("editor-spotlight-region-0")).toHaveCSS("border-top-color", "rgb(56, 189, 248)");
    await page.getByTestId("spotlight-add-region").click();
    await page.mouse.move(box.x + 250, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 340, box.y + 260);
    await page.mouse.up();
    await expect(page.getByTestId("editor-spotlight-region-2")).toBeVisible();
    await expect(page.getByTestId("spotlight-region-tabs")).toBeVisible();
    await expect(page.getByTestId("spotlight-region-tab-0")).toBeVisible();
    await expect(page.getByTestId("spotlight-region-tab-1")).toBeVisible();
    await expect(page.getByTestId("spotlight-region-tab-2")).toBeVisible();
    await expect(page.getByTestId("editor-spotlight-region-2")).toHaveCSS("border-top-color", "rgb(56, 189, 248)");
    await expect(page.getByTestId("editor-spotlight-label")).toBeVisible();
    await page.getByTestId("spotlight-show-label").uncheck();
    await expect(page.getByTestId("editor-spotlight-label")).not.toBeVisible();
    await page.getByTestId("spotlight-show-label").check();
    await expect(page.getByTestId("editor-spotlight-label")).toBeVisible();
    await expect(page.getByTestId("pause-stop-spotlight-0")).toContainText("Spotlight (3)");

    await page.getByTestId("remove-spotlight-0").click();
    await expect(page.getByTestId("pause-stop-spotlight-0")).toContainText("Add spotlight");
  });

  test("clip editor preview pauses at pause stops and shows spotlight overlay", async ({ page }) => {
    await page.getByTestId("nav-video-snippets").click();
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();

    await page.getByTestId("clip-preview").click();
    await page.getByTestId("clip-editor-video").evaluate((node) => {
      const video = node as HTMLVideoElement;
      video.currentTime = 12.5;
      video.dispatchEvent(new Event("timeupdate"));
    });

    await expect(page.getByTestId("clip-editor")).toHaveAttribute("data-preview-pause-active", "true");
    await expect(page.getByTestId("preview-spotlight-region-0")).toBeVisible();
    await expect(page.getByTestId("preview-spotlight-outside-blur")).toHaveCSS("backdrop-filter", /blur/);
    await expect(page.getByTestId("clip-preview")).toContainText("Resume preview");
  });

  test("clip editor preview can jump between pause stops with controls and arrow keys", async ({ page }) => {
    await page.getByTestId("nav-video-snippets").click();
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();

    await expect(page.getByTestId("preview-previous-stop")).toBeDisabled();
    await expect(page.getByTestId("preview-next-stop")).toBeDisabled();

    await page.getByTestId("clip-preview").click();
    await page.getByTestId("clip-editor-video").evaluate((node) => {
      node.dispatchEvent(new Event("play"));
    });

    await expect(page.getByTestId("preview-next-stop")).toBeEnabled();
    await page.getByTestId("preview-next-stop").click();
    await expect(page.getByTestId("clip-editor")).toHaveAttribute("data-preview-stop-kind", "pause");
    await expect(page.getByTestId("preview-spotlight-region-0")).toBeVisible();
    await expect(page.getByTestId("clip-preview")).toContainText("Resume preview");
    await expect
      .poll(() => page.getByTestId("clip-editor-video").evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(12.5, 1);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("clip-editor")).toHaveAttribute("data-preview-stop-kind", "end");
    await expect(page.getByTestId("preview-spotlight-region-0")).not.toBeVisible();
    await expect
      .poll(() => page.getByTestId("clip-editor-video").evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(30, 1);

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("clip-editor")).toHaveAttribute("data-preview-stop-kind", "pause");
    await expect(page.getByTestId("preview-spotlight-region-0")).toBeVisible();
  });

  test("clip editor preview jumps between start and end when there are no pause stops", async ({ page }) => {
    await page.getByTestId("nav-video-snippets").click();
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();

    await page.getByTestId("remove-pause-stop-0").click();
    await expect(page.getByTestId("pause-stops-empty")).toBeVisible();

    await page.getByTestId("clip-preview").click();
    await page.getByTestId("clip-editor-video").evaluate((node) => {
      node.dispatchEvent(new Event("play"));
    });

    await page.getByTestId("preview-next-stop").click();
    await expect(page.getByTestId("clip-editor")).toHaveAttribute("data-preview-stop-kind", "end");
    await expect
      .poll(() => page.getByTestId("clip-editor-video").evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(30, 1);

    await page.getByTestId("preview-previous-stop").click();
    await expect(page.getByTestId("clip-editor")).toHaveAttribute("data-preview-stop-kind", "start");
    await expect
      .poll(() => page.getByTestId("clip-editor-video").evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(0, 1);
  });

  test("can cancel clip editor", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    await page.getByTestId("clip-cancel").click();
    await expect(page.getByTestId("clip-editor")).not.toBeVisible();
    await expect(page.getByTestId("video-list")).toBeVisible();
  });

  test("shows delete button on each video card", async ({ page }) => {
    await expect(page.getByTestId("delete-video-0")).toBeVisible();
    await expect(page.getByTestId("delete-video-1")).toBeVisible();
  });

  test("clicking delete shows confirmation dialog", async ({ page }) => {
    await page.getByTestId("delete-video-0").click();
    await expect(page.getByTestId("delete-video-dialog")).toBeVisible();
    await expect(page.getByTestId("delete-video-dialog")).toContainText("Remove Video?");
    await expect(page.getByTestId("delete-video-dialog")).toContainText("build-process.mp4");
    await expect(page.getByTestId("confirm-delete-video")).toBeVisible();
    await expect(page.getByTestId("cancel-delete-video")).toBeVisible();
  });

  test("confirmation dialog shows associated clip count", async ({ page }) => {
    // build-process.mp4 has 1 video snippet (vs-1) in mock data
    await page.getByTestId("delete-video-0").click();
    await expect(page.getByTestId("delete-video-dialog")).toContainText("1 associated clip");
  });

  test("cancelling delete keeps video", async ({ page }) => {
    const initialCount = await page.getByTestId("video-list").locator("[data-testid^='video-item-']").count();
    await page.getByTestId("delete-video-0").click();
    await page.getByTestId("cancel-delete-video").click();
    await expect(page.getByTestId("delete-video-dialog")).not.toBeVisible();
    await expect(page.getByTestId("video-list").locator("[data-testid^='video-item-']")).toHaveCount(initialCount);
  });

  test("confirming delete removes video", async ({ page }) => {
    const initialCount = await page.getByTestId("video-list").locator("[data-testid^='video-item-']").count();
    await page.getByTestId("delete-video-1").click();
    await page.getByTestId("confirm-delete-video").click();
    await expect(page.getByTestId("delete-video-dialog")).not.toBeVisible();
    await expect(page.getByTestId("video-list").locator("[data-testid^='video-item-']")).toHaveCount(initialCount - 1);
  });
});
