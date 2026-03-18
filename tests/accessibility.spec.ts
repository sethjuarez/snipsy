import { test, expect } from "@playwright/test";

test.describe("Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Project" }).click();
    await page.getByPlaceholder("/path/to/project").fill("/mock/project");
    await page.locator('button:text-is("Open")').click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
  });

  test.describe("Modal focus trapping", () => {
    async function openDeleteDialog(page: import("@playwright/test").Page) {
      await page.getByTestId("nav-videos").click();
      await page.getByTestId("delete-video-0").click();
      await expect(page.getByTestId("delete-video-dialog")).toBeVisible();
      // Wait for the focus trap to move focus inside the dialog
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const dialog = document.querySelector(
                '[data-testid="delete-video-dialog"]',
              );
              return dialog?.contains(document.activeElement) ?? false;
            }),
          { timeout: 3000 },
        )
        .toBe(true);
    }

    test("Tab cycles focus within the delete-video dialog", async ({
      page,
    }) => {
      await openDeleteDialog(page);

      // Collect data-testids as we Tab through the dialog
      const ids: (string | null)[] = [];
      for (let i = 0; i < 4; i++) {
        const id = await page.evaluate(
          () => document.activeElement?.getAttribute("data-testid") ?? null,
        );
        ids.push(id);
        await page.keyboard.press("Tab");
      }

      // Both dialog buttons should appear in the Tab cycle
      expect(ids).toContain("cancel-delete-video");
      expect(ids).toContain("confirm-delete-video");
      // After tabbing past the last element, focus wraps to the first
      expect(ids[0]).toBe(ids[2]);
    });

    test("Escape closes the delete-video dialog", async ({ page }) => {
      await openDeleteDialog(page);

      await page.keyboard.press("Escape");
      await expect(page.getByTestId("delete-video-dialog")).not.toBeVisible();
    });
  });

  test.describe("Sidebar keyboard navigation", () => {
    test("active nav item has aria-current='page'", async ({ page }) => {
      const sidebar = page.getByTestId("sidebar");

      // After opening a project the home view is active
      await expect(sidebar.getByTestId("nav-home").first()).toHaveAttribute(
        "aria-current",
        "page",
      );

      // Click a different nav item
      await sidebar.getByTestId("nav-text-snippets").click();
      await expect(sidebar.getByTestId("nav-text-snippets")).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Previous item should no longer be current
      const homeCurrent = await sidebar
        .getByTestId("nav-home")
        .first()
        .getAttribute("aria-current");
      expect(homeCurrent).toBeNull();
    });

    test("aria-current moves when switching views", async ({ page }) => {
      const sidebar = page.getByTestId("sidebar");

      await sidebar.getByTestId("nav-videos").click();
      await expect(sidebar.getByTestId("nav-videos")).toHaveAttribute(
        "aria-current",
        "page",
      );

      await sidebar.getByTestId("nav-scripts").click();
      await expect(sidebar.getByTestId("nav-scripts")).toHaveAttribute(
        "aria-current",
        "page",
      );
      const videosCurrent = await sidebar
        .getByTestId("nav-videos")
        .getAttribute("aria-current");
      expect(videosCurrent).toBeNull();
    });
  });

  test.describe("Form label associations", () => {
    test("text snippet form labels are associated with inputs", async ({
      page,
    }) => {
      await page.getByTestId("nav-text-snippets").click();
      await page.getByTestId("add-snippet").click();
      await expect(page.getByTestId("snippet-form")).toBeVisible();

      const pairs = [
        { labelFor: "snippet-title", inputId: "snippet-title" },
        { labelFor: "snippet-description", inputId: "snippet-description" },
        { labelFor: "snippet-text", inputId: "snippet-text" },
        { labelFor: "snippet-hotkey", inputId: "snippet-hotkey" },
      ];

      for (const { labelFor, inputId } of pairs) {
        const label = page.locator(`label[for="${labelFor}"]`);
        await expect(label).toBeVisible();
        const input = page.locator(`#${inputId}`);
        await expect(input).toBeVisible();
      }
    });
  });

  test.describe("Focus visible styles", () => {
    test("focused interactive elements show a visible outline", async ({
      page,
    }) => {
      // Tab to trigger :focus-visible on the first interactive element
      await page.keyboard.press("Tab");

      const outline = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "";
        return window.getComputedStyle(el).outlineStyle;
      });

      // The global CSS sets `outline: 2px solid var(--color-accent)` on :focus-visible
      expect(outline).not.toBe("none");
      expect(outline).not.toBe("");

      // Also verify the sidebar nav button gets a 2px outline
      const sidebar = page.getByTestId("sidebar");
      await sidebar.getByTestId("nav-text-snippets").focus();

      const styles = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return { width: "", style: "" };
        const cs = window.getComputedStyle(el);
        return { width: cs.outlineWidth, style: cs.outlineStyle };
      });

      expect(styles.style).not.toBe("none");
      expect(styles.width).toBe("2px");
    });
  });
});
