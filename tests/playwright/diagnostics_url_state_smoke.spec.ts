import { test, expect } from "@playwright/test";

/**
 * Phase X — `?page=diagnostics` hydrates diagnostics-only panels (production build + vite preview).
 */
test.describe("Diagnostics URL state smoke", () => {
  test("?page=diagnostics shows live input quality + match coverage landmarks", async ({ page }) => {
    await page.goto("/?page=diagnostics");
    await expect(page).toHaveURL(/page=diagnostics/);
    await expect(page.getByTestId("live-input-quality-panel")).toBeVisible();
    await expect(page.getByTestId("match-coverage-diagnostics")).toBeVisible();
    await expect(page.getByText("Live input quality")).toBeVisible();
    await expect(page.getByText("Match coverage quality")).toBeVisible();
  });
});
