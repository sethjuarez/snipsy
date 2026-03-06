import { test, expect } from "@playwright/test";

test.describe("Text Snippet Delete", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.locator("header")).toBeVisible();
  });

  test("can delete a snippet with confirmation", async ({ page }) => {
    // Verify snippet exists
    await expect(page.getByTestId("snippet-ts-2")).toBeVisible();

    // Accept the confirm dialog
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByTestId("delete-ts-2").click();

    // Verify snippet is removed
    await expect(page.getByTestId("snippet-ts-2")).not.toBeVisible();
    // Other snippets should still exist
    await expect(page.getByTestId("snippet-ts-1")).toBeVisible();
    await expect(page.getByTestId("snippet-ts-3")).toBeVisible();
  });

  test("cancel delete keeps snippet", async ({ page }) => {
    // Dismiss the confirm dialog
    page.on("dialog", (dialog) => dialog.dismiss());

    await page.getByTestId("delete-ts-1").click();

    // Snippet should still exist
    await expect(page.getByTestId("snippet-ts-1")).toBeVisible();
  });

  test("deleting all snippets shows empty state", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByTestId("delete-ts-1").click();
    await expect(page.getByTestId("snippet-ts-1")).not.toBeVisible();

    await page.getByTestId("delete-ts-2").click();
    await expect(page.getByTestId("snippet-ts-2")).not.toBeVisible();

    await page.getByTestId("delete-ts-3").click();
    await expect(page.getByTestId("snippet-ts-3")).not.toBeVisible();

    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});
