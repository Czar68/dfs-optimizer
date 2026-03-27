import { test, expect } from "@playwright/test";

/**
 * Phase Y — Default `/` loads Overview (OptimizerStatePanels variant overview).
 */
test.describe("Overview URL state smoke", () => {
  test("default route shows Overview-only status strip", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/page=(explore|diagnostics)/);
    await expect(page.getByTestId("optimizer-state-panels")).toBeVisible();
    await expect(page.getByTestId("overview-status-strip")).toBeVisible();
    await expect(page.getByText("Dashboard data refreshed")).toBeVisible();
  });
});
