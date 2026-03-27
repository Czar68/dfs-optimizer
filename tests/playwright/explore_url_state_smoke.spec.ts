import { test, expect } from "@playwright/test";

/**
 * Phase W — Explore URL hydration (Phase T) + history restoration (Phase V).
 * Production build + vite preview (see playwright.config.ts).
 */
test.describe("Explore URL state smoke", () => {
  test("hydrates top-legs + legsTop from query; back restores", async ({ page }) => {
    await page.goto("/?page=explore&tab=top_legs_pp&legsTop=25");
    await expect(page).toHaveURL(/page=explore/);
    await expect(page).toHaveURL(/tab=top_legs_pp/);
    await expect(page).toHaveURL(/legsTop=25/);
    await expect(page.getByText(/PP Top Legs/)).toBeVisible();

    await expect(page.getByTestId("explore-top-legs-limit")).toHaveValue("25");

    await page.goto("/?page=explore&tab=all");
    await expect(page).toHaveURL(/tab=all/);
    await expect(page.getByText(/PP Top Legs/)).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/tab=top_legs_pp/);
    await expect(page).toHaveURL(/legsTop=25/);
    await expect(page.getByText(/PP Top Legs/)).toBeVisible();
    await expect(page.getByTestId("explore-top-legs-limit")).toHaveValue("25");
  });
});
