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

  test("can cancel clip editor", async ({ page }) => {
    await page.getByTestId("create-clip-0").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    await page.getByTestId("clip-cancel").click();
    await expect(page.getByTestId("clip-editor")).not.toBeVisible();
    await expect(page.getByTestId("video-list")).toBeVisible();
  });
});
