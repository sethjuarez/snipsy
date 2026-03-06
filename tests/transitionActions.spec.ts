import { test, expect } from "@playwright/test";

test.describe("Transition Action UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.locator("header")).toBeVisible();
  });

  test("can add a transition action to a new video snippet", async ({
    page,
  }) => {
    await page.getByTestId("add-video-snippet").click();
    await expect(page.getByTestId("video-snippet-form")).toBeVisible();
    await expect(page.getByTestId("no-transition-actions")).toBeVisible();

    // Add a transition action
    await page.getByTestId("add-transition-action").click();
    await expect(page.getByTestId("transition-action-0")).toBeVisible();
    await expect(page.getByTestId("no-transition-actions")).not.toBeVisible();

    // Set coordinates
    await page.getByTestId("transition-x-0").fill("350");
    await page.getByTestId("transition-y-0").fill("40");

    // Fill required fields and save
    await page.getByTestId("video-snippet-title").fill("Action Test");
    await page.getByTestId("video-snippet-file").fill("videos/test.mp4");
    await page.getByTestId("video-snippet-hotkey").focus();
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await page.getByTestId("video-snippet-save").click();

    // Verify snippet created
    await expect(page.getByText("Action Test")).toBeVisible();
  });

  test("shows existing transition actions when editing", async ({ page }) => {
    // The mock data has a video snippet "vs-1" with one transition action
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("video-snippet-form")).toBeVisible();
    await expect(page.getByTestId("transition-action-0")).toBeVisible();
    await expect(page.getByTestId("transition-x-0")).toHaveValue("350");
    await expect(page.getByTestId("transition-y-0")).toHaveValue("40");
  });

  test("can remove a transition action", async ({ page }) => {
    await page.getByTestId("video-edit-vs-1").click();
    await expect(page.getByTestId("transition-action-0")).toBeVisible();

    await page.getByTestId("transition-remove-0").click();
    await expect(page.getByTestId("transition-action-0")).not.toBeVisible();
    await expect(page.getByTestId("no-transition-actions")).toBeVisible();
  });

  test("can add multiple transition actions", async ({ page }) => {
    await page.getByTestId("add-video-snippet").click();
    await page.getByTestId("add-transition-action").click();
    await page.getByTestId("add-transition-action").click();
    await expect(page.getByTestId("transition-action-0")).toBeVisible();
    await expect(page.getByTestId("transition-action-1")).toBeVisible();
  });
});
