import { test, expect } from "@playwright/test";

test.describe("Script Recording", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await page.getByTestId("nav-scripts").click();
  });

  test("shows record button in scripts header", async ({ page }) => {
    await expect(page.getByTestId("record-script")).toBeVisible();
    await expect(page.getByTestId("record-script")).toContainText("Record");
  });

  test("start recording shows recording indicator", async ({ page }) => {
    await page.getByTestId("record-script").click();
    await expect(page.getByTestId("recording-indicator")).toBeVisible();
    await expect(page.getByTestId("recording-indicator")).toContainText("Recording in progress");
  });

  test("stop recording shows save dialog", async ({ page }) => {
    await page.getByTestId("record-script").click();
    await expect(page.getByTestId("recording-indicator")).toBeVisible();

    await page.getByTestId("stop-recording").click();
    await expect(page.getByTestId("recording-save-dialog")).toBeVisible();
    await expect(page.getByTestId("recording-title")).toBeVisible();
    await expect(page.getByTestId("recording-description")).toBeVisible();
  });

  test("save recording creates a new script", async ({ page }) => {
    await page.getByTestId("record-script").click();
    await page.getByTestId("stop-recording").click();
    await expect(page.getByTestId("recording-save-dialog")).toBeVisible();

    await page.getByTestId("recording-title").fill("My Recording");
    await page.getByTestId("recording-description").fill("Automated test recording");
    await page.getByTestId("recording-save").click();

    await expect(page.getByTestId("recording-save-dialog")).not.toBeVisible();
    await expect(page.getByText("My Recording")).toBeVisible();
  });

  test("record button hidden while recording", async ({ page }) => {
    await expect(page.getByTestId("record-script")).toBeVisible();
    await page.getByTestId("record-script").click();
    await expect(page.getByTestId("record-script")).not.toBeVisible();
    await expect(page.getByTestId("stop-recording-header")).toBeVisible();
  });

  test("platform badge shows on recorded scripts", async ({ page }) => {
    await expect(page.getByTestId("script-platform-sc-1")).toBeVisible();
    await expect(page.getByTestId("script-platform-sc-1")).toContainText("Windows");
  });
});
