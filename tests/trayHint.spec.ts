import { test, expect } from "@playwright/test";

test.describe("Tray hint banner", () => {
  test.beforeEach(async ({ page }) => {
    // Clear the localStorage flag so the hint shows fresh each time
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("snipsy-tray-hint-dismissed"));
    await page.reload();
  });

  test("shows tray hint on first visit", async ({ page }) => {
    const hint = page.getByTestId("tray-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Pin Snipsy");
    await expect(hint).toContainText("Taskbar settings");
  });

  test("dismiss button hides hint permanently", async ({ page }) => {
    const hint = page.getByTestId("tray-hint");
    await expect(hint).toBeVisible();

    await page.getByTestId("tray-hint-dismiss").click();
    await expect(hint).not.toBeVisible();

    // Reload — should stay dismissed
    await page.reload();
    await expect(page.getByTestId("tray-hint")).not.toBeVisible();
  });

  test("hint not shown after dismissal", async ({ page }) => {
    // Manually set the flag
    await page.evaluate(() => localStorage.setItem("snipsy-tray-hint-dismissed", "1"));
    await page.reload();
    await expect(page.getByTestId("tray-hint")).not.toBeVisible();
  });
});
