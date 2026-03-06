import { test, expect } from "@playwright/test";

test.describe("Text Snippet Form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });

  test("can open create form and cancel", async ({ page }) => {
    await page.getByTestId("add-snippet").click();
    await expect(page.getByTestId("snippet-form")).toBeVisible();
    await page.getByTestId("snippet-cancel").click();
    await expect(page.getByTestId("snippet-form")).not.toBeVisible();
  });

  test("can create a new text snippet", async ({ page }) => {
    await page.getByTestId("add-snippet").click();
    await page.getByTestId("snippet-title").fill("New Snippet");
    await page.getByTestId("snippet-description").fill("A test snippet");
    await page.getByTestId("snippet-text").fill("console.log('test');");

    // Set hotkey by simulating keyboard
    await page.getByTestId("snippet-hotkey").focus();
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyK");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");

    await page.getByTestId("snippet-save").click();

    // Verify it appears in the list
    await expect(page.getByText("New Snippet")).toBeVisible();
    await expect(page.getByTestId("text-snippet-list")).toBeVisible();
  });

  test("can edit an existing text snippet", async ({ page }) => {
    await page.getByTestId("edit-ts-1").click();
    await expect(page.getByTestId("snippet-form")).toBeVisible();

    // The form should be pre-filled
    await expect(page.getByTestId("snippet-title")).toHaveValue("React Import");

    // Change the title
    await page.getByTestId("snippet-title").fill("Updated Import");
    await page.getByTestId("snippet-save").click();

    // Verify the updated snippet appears in the list
    await expect(page.getByText("Updated Import")).toBeVisible();
    // The old title should no longer exist as a heading
    const snippetHeadings = page.locator("h3");
    await expect(snippetHeadings.filter({ hasText: "React Import" })).toHaveCount(0);
  });

  test("form shows delivery method options", async ({ page }) => {
    await page.getByTestId("add-snippet").click();
    await expect(page.getByTestId("delivery-fast-type")).toBeChecked();
    await expect(page.getByTestId("snippet-type-delay")).toBeVisible();

    // Switch to paste
    await page.getByTestId("delivery-paste").click();
    await expect(page.getByTestId("delivery-paste")).toBeChecked();
    // Type delay should be hidden for paste
    await expect(page.getByTestId("snippet-type-delay")).not.toBeVisible();
  });
});
