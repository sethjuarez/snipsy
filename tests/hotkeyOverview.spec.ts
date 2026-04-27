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

  test("can jump from overview to edit a text snippet", async ({ page }) => {
    await page.getByTestId("overview-edit-text-ts-1").click();
    await expect(page.getByTestId("snippet-form")).toBeVisible();
    await expect(page.getByTestId("snippet-title")).toHaveValue("React Import");
  });

  test("can jump from overview to edit a video snippet", async ({ page }) => {
    await page.getByTestId("overview-edit-video-vs-1").click();
    await expect(page.getByTestId("clip-editor")).toBeVisible();
    await expect(page.getByTestId("clip-title")).toHaveValue("Build Process");
  });

  test("can delete a text snippet from the overview", async ({ page }) => {
    await expect(page.getByTestId("overview-delete-text-ts-2")).toBeVisible();
    await page.getByTestId("overview-delete-text-ts-2").click();
    await expect(page.getByTestId("confirm-delete-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("overview-delete-text-ts-2")).not.toBeVisible();
    await page.getByTestId("nav-text-snippets").click();
    await expect(page.getByTestId("snippet-ts-2")).not.toBeVisible();
  });

  test("can delete a video clip from the overview", async ({ page }) => {
    await expect(page.getByTestId("overview-delete-video-vs-1")).toBeVisible();
    await page.getByTestId("overview-delete-video-vs-1").click();
    await expect(page.getByTestId("confirm-delete-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("overview-delete-video-vs-1")).not.toBeVisible();
    await page.getByTestId("nav-video-snippets").click();
    await expect(page.getByTestId("video-snippet-vs-1")).not.toBeVisible();
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
