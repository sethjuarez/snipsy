import { test, expect } from "@playwright/test";

test.describe("Hotkey Overview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });

  test("overview is the default tab", async ({ page }) => {
    await expect(page.getByTestId("hotkey-overview")).toBeVisible();
  });

  test("displays hotkey entries for text and video snippets", async ({ page }) => {
    const entries = page.getByTestId("hotkey-entry");
    await expect(entries.first()).toBeVisible();
    const count = await entries.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shows empty state for new project with no snippets", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/new");
    await page.getByPlaceholder("My Demo").fill("Empty");
    await page.locator('button:text-is("Create")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("hotkey-overview-empty")).toBeVisible();
  });
});
