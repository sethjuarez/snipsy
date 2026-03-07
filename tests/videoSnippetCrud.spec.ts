import { test, expect } from "@playwright/test";

test.describe("Video Snippet CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    // Navigate to Clips view
    await page.getByTestId("nav-video-snippets").click();
  });

  test("shows video snippets from mock data", async ({ page }) => {
    await expect(page.getByTestId("video-snippet-list")).toBeVisible();
    await expect(page.getByTestId("video-snippet-vs-1")).toBeVisible();
    await expect(page.getByTestId("video-snippet-vs-1")).toContainText(
      "Build Process",
    );
  });

  test("can create a video snippet", async ({ page }) => {
    await page.getByTestId("add-video-snippet").click();
    await expect(page.getByTestId("video-snippet-form")).toBeVisible();

    await page.getByTestId("video-snippet-title").fill("New Video Snippet");
    await page.getByTestId("video-snippet-file").fill("videos/test.mp4");
    await page.getByTestId("video-snippet-start").fill("5");
    await page.getByTestId("video-snippet-end").fill("20");

    // Set hotkey
    await page.getByTestId("video-snippet-hotkey").focus();
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyM");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");

    await page.getByTestId("video-snippet-save").click();
    await expect(page.getByText("New Video Snippet")).toBeVisible();
  });

  test("can edit a video snippet", async ({ page }) => {
    await page.getByTestId("video-edit-vs-1").click();
    // Edit now opens the visual clip editor
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    await expect(page.getByTestId("clip-title")).toHaveValue("Build Process");

    await page.getByTestId("clip-title").fill("Updated Build");
    await page.getByTestId("clip-save").click();
    // Returns to video-snippets list (the view changed to videos, navigate back)
    await page.getByTestId("nav-video-snippets").click();
    await expect(page.getByText("Updated Build")).toBeVisible();
  });

  test("can delete a video snippet", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("video-delete-vs-1").click();
    await expect(page.getByTestId("video-snippet-vs-1")).not.toBeVisible();
    await expect(page.getByTestId("video-empty-state")).toBeVisible();
  });

  test("shows preview button on each clip", async ({ page }) => {
    const previewBtn = page.getByTestId("video-preview-vs-1");
    await expect(previewBtn).toBeVisible();
  });
});
