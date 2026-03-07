import { test, expect } from "@playwright/test";

test.describe("Update Indicator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });

  test("does not show update indicator when no update available", async ({
    page,
  }) => {
    // By default the mock environment has no real updater, so no update
    await expect(page.getByTestId("update-indicator")).not.toBeVisible();
  });

  test("shows update indicator when update is available", async ({ page }) => {
    // Inject a mock update into the Zustand store
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__UPDATE_STORE__;
      if (store) {
        store.setState({
          update: {
            version: "1.2.3",
            body: "Bug fixes and improvements",
            downloadAndInstall: async () => {},
          },
        });
      }
    });

    // Since we can't easily access the Zustand store from outside,
    // we'll use a more reliable approach: set the store via the page context
    await page.evaluate(async () => {
      const mod = await import("/src/stores/updateStore.ts");
      mod.useUpdateStore.setState({
        update: {
          version: "1.2.3",
          body: "Bug fixes and improvements",
          downloadAndInstall: async () => {},
        },
        checking: false,
        dismissed: false,
      });
    });

    await expect(page.getByTestId("update-indicator")).toBeVisible();
  });

  test("opens dropdown with version and install button when clicked", async ({
    page,
  }) => {
    // Inject mock update
    await page.evaluate(async () => {
      const mod = await import("/src/stores/updateStore.ts");
      mod.useUpdateStore.setState({
        update: {
          version: "2.0.0",
          body: "Major release with new features",
          downloadAndInstall: async () => {},
        },
        checking: false,
        dismissed: false,
      });
    });

    await page.getByTestId("update-indicator").click();

    const dropdown = page.getByTestId("update-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText("Update Available");
    await expect(dropdown).toContainText("v2.0.0");
    await expect(dropdown).toContainText("Major release with new features");
    await expect(page.getByTestId("update-install-btn")).toBeVisible();
  });

  test("closes dropdown on Escape key", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/stores/updateStore.ts");
      mod.useUpdateStore.setState({
        update: {
          version: "2.0.0",
          body: "New features",
          downloadAndInstall: async () => {},
        },
        checking: false,
        dismissed: false,
      });
    });

    await page.getByTestId("update-indicator").click();
    await expect(page.getByTestId("update-dropdown")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("update-dropdown")).not.toBeVisible();
  });

  test("shows progress when install is clicked", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/stores/updateStore.ts");
      mod.useUpdateStore.setState({
        update: {
          version: "2.0.0",
          body: "New features",
          downloadAndInstall: async (onEvent?: (e: unknown) => void) => {
            if (onEvent) {
              onEvent({ event: "Started", data: { chunkLength: 0 } });
              onEvent({
                event: "Progress",
                data: { chunkLength: 1048576 },
              });
            }
            // Never resolve — keep "downloading" state visible
            return new Promise(() => {});
          },
        },
        checking: false,
        dismissed: false,
      });
    });

    await page.getByTestId("update-indicator").click();
    await page.getByTestId("update-install-btn").click();

    const progress = page.getByTestId("update-progress");
    await expect(progress).toBeVisible();
    await expect(progress).toContainText("MB");
  });
});
