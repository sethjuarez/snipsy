import { test, expect } from "@playwright/test";

test.describe("Demo Mode Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.locator("header")).toBeVisible();
  });

  test("shows enter demo mode button", async ({ page }) => {
    await expect(page.getByTestId("demo-mode-toggle")).toBeVisible();
    await expect(page.getByTestId("demo-mode-toggle")).toContainText(
      "Enter Demo Mode",
    );
  });

  test("can toggle demo mode on and off", async ({ page }) => {
    // Enter demo mode
    await page.getByTestId("demo-mode-toggle").click();
    await expect(page.getByTestId("demo-mode-toggle")).toContainText(
      "Exit Demo Mode",
    );
    await expect(page.getByTestId("demo-mode-indicator")).toBeVisible();
    await expect(page.getByTestId("demo-mode-indicator")).toContainText("LIVE");

    // Exit demo mode
    await page.getByTestId("demo-mode-toggle").click();
    await expect(page.getByTestId("demo-mode-toggle")).toContainText(
      "Enter Demo Mode",
    );
    await expect(page.getByTestId("demo-mode-indicator")).not.toBeVisible();
  });
});
