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
