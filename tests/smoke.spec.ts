import { test, expect } from "@playwright/test";

test("homepage shows Snipsy heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Snipsy");
});

test("welcome screen shows open and create buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open Project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
});
