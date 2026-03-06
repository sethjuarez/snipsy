import { test, expect } from "@playwright/test";

test.describe("Demo Mode Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });

  test("shows enter demo mode button", async ({ page }) => {
    await expect(page.getByTestId("demo-mode-toggle")).toBeVisible();
    await expect(page.getByTestId("demo-mode-toggle")).toContainText("Demo");
  });

  test("can toggle demo mode on and off", async ({ page }) => {
    // Enter demo mode
    await page.getByTestId("demo-mode-toggle").click();
    await expect(page.getByTestId("demo-mode-toggle")).toContainText("LIVE");
    await expect(page.getByTestId("status-bar")).toContainText("LIVE DEMO");

    // Exit demo mode
    await page.getByTestId("demo-mode-toggle").click();
    await expect(page.getByTestId("demo-mode-toggle")).toContainText("Demo");
    await expect(page.getByTestId("status-bar")).not.toContainText("LIVE DEMO");
  });
});
