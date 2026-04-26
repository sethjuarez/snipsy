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

  test("hides cursor by default", async ({ page }) => {
    await page.goto("/playback?file=test.mp4");
    const container = page.getByTestId("playback-container");
    await expect(container).toHaveCSS("cursor", "none");
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveCSS("cursor", "none");
  });

  test("shows cursor when hideCursor is false", async ({ page }) => {
    await page.goto("/playback?file=test.mp4&hideCursor=false");
    const container = page.getByTestId("playback-container");
    await expect(container).toHaveCSS("cursor", "auto");
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveCSS("cursor", "auto");
  });

  test("uses black background by default", async ({ page }) => {
    await page.goto("/playback?file=test.mp4");
    const container = page.getByTestId("playback-container");
    await expect(container).toHaveCSS("background-color", "rgb(0, 0, 0)");
  });

  test("applies custom background color", async ({ page }) => {
    await page.goto("/playback?file=test.mp4&bg=%231e1e1e");
    const container = page.getByTestId("playback-container");
    await expect(container).toHaveCSS("background-color", "rgb(30, 30, 30)");
  });

  test("click-to-play defaults to false (auto-play)", async ({ page }) => {
    await page.goto("/playback?file=test.mp4");
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveAttribute("data-click-to-play", "false");
  });

  test("click-to-play sets data attribute when enabled", async ({ page }) => {
    await page.goto("/playback?file=test.mp4&clickToPlay=true");
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveAttribute("data-click-to-play", "true");
  });

  test("muted defaults to true", async ({ page }) => {
    await page.goto("/playback?file=test.mp4");
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveAttribute("data-muted", "true");
  });

  test("muted can be set to false", async ({ page }) => {
    await page.goto("/playback?file=test.mp4&muted=false");
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveAttribute("data-muted", "false");
  });

  test("pause stops are parsed as source-video timestamps within the clip range", async ({ page }) => {
    const stops = encodeURIComponent(JSON.stringify([
      { time: 0 },
      { time: 10.5, label: "Explain result" },
      { time: 40 },
    ]));
    await page.goto(`/playback?file=test.mp4&start=5&end=30&speed=3&pauseStops=${stops}`);
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveAttribute("data-pause-stops", "1");
  });

  test("pause stops preserve valid spotlight regions", async ({ page }) => {
    const stops = encodeURIComponent(JSON.stringify([
      {
        time: 10.5,
        label: "Explain result",
        spotlight: {
          regions: [
            { type: "rectangle", x: 10, y: 12, width: 30, height: 20 },
            { type: "rectangle", x: 96, y: 12, width: 1, height: 20 },
          ],
        },
      },
    ]));
    await page.goto(`/playback?file=test.mp4&start=5&end=30&speed=3&pauseStops=${stops}`);
    const video = page.getByTestId("playback-video");
    await expect(video).toHaveAttribute("data-pause-stops", "1");
    await expect(video).toHaveAttribute("data-pause-spotlight-regions", "1");
  });
});
