import { test, expect } from "@playwright/test";

test.describe("FFmpeg Detection", () => {
  test("shows FFmpeg warning when not available", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
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

  test("clicking FFmpeg warning opens helper dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();

    await page.getByTestId("nav-scripts").click();
    await page.getByTestId("ffmpeg-warning").click();

    // Helper dialog should appear
    await expect(page.getByText("FFmpeg Required")).toBeVisible();
    await expect(page.getByText("Install FFmpeg Automatically")).toBeVisible();
    await expect(page.getByText("Check Again")).toBeVisible();
    await expect(page.getByText("Manual installation instructions")).toBeVisible();
  });

  test("FFmpeg helper dialog can be closed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();

    await page.getByTestId("nav-scripts").click();
    await page.getByTestId("ffmpeg-warning").click();
    await expect(page.getByText("FFmpeg Required")).toBeVisible();

    // Close via X button
    await page.getByRole("button", { name: /^$/ }).locator("svg").first().click();
    await expect(page.getByText("FFmpeg Required")).not.toBeVisible();
  });
});
