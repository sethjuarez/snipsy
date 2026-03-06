import { test, expect } from "@playwright/test";

test.describe("Playback Window", () => {
  test("renders video element with correct attributes", async ({ page }) => {
    await page.goto(
      "/playback?file=videos/demo.mp4&start=5&end=30&speed=1.5",
    );
    await expect(page.getByTestId("playback-container")).toBeVisible();
    const video = page.getByTestId("playback-video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("data-file", "videos/demo.mp4");
    await expect(video).toHaveAttribute("data-start", "5");
    await expect(video).toHaveAttribute("data-end", "30");
    await expect(video).toHaveAttribute("data-speed", "1.5");
  });

  test("shows error when no file specified", async ({ page }) => {
    await page.goto("/playback");
    await expect(page.getByTestId("playback-error")).toBeVisible();
    await expect(page.getByTestId("playback-error")).toContainText(
      "No video file specified",
    );
  });

  test("uses default values for missing params", async ({ page }) => {
    await page.goto("/playback?file=test.mp4");
    const video = page.getByTestId("playback-video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("data-start", "0");
    await expect(video).toHaveAttribute("data-end", "0");
    await expect(video).toHaveAttribute("data-speed", "1");
  });
});
