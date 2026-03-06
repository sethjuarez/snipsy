import { test, expect } from "@playwright/test";

test.describe("Text Snippet List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // In browser-only mode, MockBackendService is used.
    // Open a mock project to get fixture data.
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    // Click the submit button (not the mode toggle)
    await page.locator('button:text-is("Open")').click();
    // Wait for project to load (sidebar appears)
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });

  test("displays text snippets from mock data", async ({ page }) => {
    await expect(page.getByTestId("text-snippet-list")).toBeVisible();
    // MockBackendService returns 3 text snippets
    await expect(page.getByTestId("snippet-ts-1")).toBeVisible();
    await expect(page.getByTestId("snippet-ts-2")).toBeVisible();
    await expect(page.getByTestId("snippet-ts-3")).toBeVisible();
  });

  test("shows snippet titles and hotkeys", async ({ page }) => {
    await expect(page.getByTestId("snippet-ts-1")).toContainText("React Import");
    await expect(page.getByTestId("snippet-ts-1")).toContainText(
      "CmdOrControl+Shift+1",
    );
    await expect(page.getByTestId("snippet-ts-1")).toContainText("fast-type");
  });

  test("shows empty state when no snippets", async ({ page }) => {
    // Create a new empty project by navigating fresh
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/new");
    await page.getByPlaceholder("My Demo").fill("Empty");
    await page.locator('button:text-is("Create")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("empty-state")).toContainText(
      "No text snippets yet",
    );
  });
});
