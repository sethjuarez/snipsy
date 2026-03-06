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

  test("shows video list from mock data", async ({ page }) => {
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
    // Get initial count
    const initialItems = await page.getByTestId("video-list").locator("li").count();

    await page.getByTestId("import-video").click();

    // Wait for the new item to appear
    await expect(
      page.getByTestId("video-list").locator("li"),
    ).toHaveCount(initialItems + 1);
  });
});
