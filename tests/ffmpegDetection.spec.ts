import { test, expect } from "@playwright/test";

test.describe("FFmpeg Detection", () => {
  test("shows FFmpeg warning when not available", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();

    // Navigate to Scripts view where FFmpeg warning is shown
    await page.getByTestId("nav-scripts").click();

    // Mock backend returns false for checkFfmpeg
    await expect(page.getByTestId("ffmpeg-warning")).toBeVisible();
    await expect(page.getByTestId("ffmpeg-warning")).toContainText(
      "FFmpeg not found",
    );
  });
});
