/**
 * Playwright script to capture screenshots for the docs site.
 * Run: npx playwright test tests/screenshots.spec.ts --reporter=list
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.resolve(__dirname, "../docs/public/images");

async function openProject(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Project" }).click();
  await page.getByPlaceholder("/path/to/project").fill("/mock/project");
  await page.locator('button:text-is("Open")').click();
  // Wait for the project to load (sidebar visible)
  await page.getByTestId("sidebar").waitFor();
}

test.describe("Documentation screenshots", () => {
  test("welcome screen", async ({ page }) => {
    await page.goto("/");
    // Dismiss the tray hint if present so it doesn't clutter the screenshot
    const hint = page.getByTestId("tray-hint-dismiss");
    if (await hint.isVisible().catch(() => false)) {
      await hint.click();
    }
    await expect(page.locator("h1")).toContainText("Snipsy");
    await page.screenshot({ path: path.join(IMG_DIR, "welcome.png"), fullPage: true });
  });

  test("hotkey overview", async ({ page }) => {
    await openProject(page);
    // Default view after opening project is home/overview
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(IMG_DIR, "hotkey-overview.png"), fullPage: true });
  });

  test("text snippet list", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("nav-text-snippets").click();
    await expect(page.getByTestId("text-snippet-list")).toBeVisible();
    await page.screenshot({ path: path.join(IMG_DIR, "text-list.png"), fullPage: true });
  });

  test("text snippet form", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("nav-text-snippets").click();
    await expect(page.getByTestId("snippet-ts-1")).toBeVisible();
    await page.getByTestId("snippet-ts-1").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(IMG_DIR, "text-form.png"), fullPage: true });
  });

  test("video list", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("nav-videos").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(IMG_DIR, "video-list.png"), fullPage: true });
  });

  test("video snippet list", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("nav-video-snippets").click();
    await expect(page.getByTestId("video-snippet-list")).toBeVisible();
    await page.screenshot({ path: path.join(IMG_DIR, "video-snippet-list.png"), fullPage: true });
  });

  test("script list", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("nav-scripts").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(IMG_DIR, "script-list.png"), fullPage: true });
  });

  test("dark mode", async ({ page }) => {
    await openProject(page);
    await page.waitForTimeout(200);
    // Toggle to dark mode
    await page.getByTestId("theme-toggle").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(IMG_DIR, "dark-mode.png"), fullPage: true });
  });
});
