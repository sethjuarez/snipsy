import { test, expect } from "@playwright/test";

test("homepage shows Snipsy heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Snipsy");
});
