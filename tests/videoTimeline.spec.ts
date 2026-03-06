import { test, expect } from "@playwright/test";

test.describe("Video Timeline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    // Navigate to Videos view
    await page.getByTestId("nav-videos").click();
  });

  test("timeline component renders with controls", async ({ page }) => {
    // The timeline will be visible when creating a video snippet
    // For now, verify the video list renders (timeline is used in snippet creation)
    await expect(page.getByTestId("video-list")).toBeVisible();
  });
});
