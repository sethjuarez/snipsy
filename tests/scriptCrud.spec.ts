import { test, expect } from "@playwright/test";

test.describe("Script CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.locator("header")).toBeVisible();
  });

  test("shows scripts from mock data", async ({ page }) => {
    await expect(page.getByTestId("script-list")).toBeVisible();
    await expect(page.getByTestId("script-sc-1")).toBeVisible();
    await expect(page.getByTestId("script-sc-1")).toContainText(
      "Build Demo Script",
    );
  });

  test("can create a script with steps", async ({ page }) => {
    await page.getByTestId("add-script").click();
    await expect(page.getByTestId("script-form")).toBeVisible();

    await page.getByTestId("script-title").fill("New Script");
    await page.getByTestId("script-output").fill("videos/new-output.mp4");
    await page.getByTestId("script-description").fill("Test script");

    // Add steps
    await page.getByTestId("add-step").click();
    await expect(page.getByTestId("step-0")).toBeVisible();
    await page.getByTestId("step-duration-0").fill("2000");

    await page.getByTestId("add-step").click();
    await page.getByTestId("step-action-1").selectOption("type");
    await page.getByTestId("step-text-1").fill("hello world");

    await page.getByTestId("script-save").click();
    await expect(page.getByText("New Script")).toBeVisible();
  });

  test("can edit an existing script", async ({ page }) => {
    await page.getByTestId("script-edit-sc-1").click();
    await expect(page.getByTestId("script-form")).toBeVisible();
    await expect(page.getByTestId("script-title")).toHaveValue(
      "Build Demo Script",
    );

    await page.getByTestId("script-title").fill("Updated Script");
    await page.getByTestId("script-save").click();
    await expect(page.getByText("Updated Script")).toBeVisible();
  });

  test("can delete a script", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("script-delete-sc-1").click();
    await expect(page.getByTestId("script-sc-1")).not.toBeVisible();
    await expect(page.getByTestId("script-empty-state")).toBeVisible();
  });

  test("shows step editor with different action types", async ({ page }) => {
    await page.getByTestId("add-script").click();
    await expect(page.getByTestId("no-steps")).toBeVisible();

    // Add a wait step
    await page.getByTestId("add-step").click();
    await expect(page.getByTestId("step-duration-0")).toBeVisible();

    // Change to type step
    await page.getByTestId("step-action-0").selectOption("type");
    await expect(page.getByTestId("step-text-0")).toBeVisible();

    // Change to keypress step
    await page.getByTestId("step-action-0").selectOption("keypress");
    await expect(page.getByTestId("step-key-0")).toBeVisible();

    // Change to click step
    await page.getByTestId("step-action-0").selectOption("click");
    await expect(page.getByTestId("step-x-0")).toBeVisible();
    await expect(page.getByTestId("step-y-0")).toBeVisible();

    // Remove step
    await page.getByTestId("step-remove-0").click();
    await expect(page.getByTestId("no-steps")).toBeVisible();
  });
});
