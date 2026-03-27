import { test, expect } from "@playwright/test";

/**
 * Phase 25 — Single-route browser smoke for ?view=canonical-samples (production build + vite preview).
 */
test.describe("canonical samples UI smoke", () => {
  test("/?view=canonical-samples shows read-only bundle panel (not error)", async ({ page }) => {
    await page.goto("/?view=canonical-samples");
    await expect(page.getByText("Canonical sample bundle (read-only)")).toBeVisible();
    await expect(page.getByTestId("canonical-samples-error-headline")).toHaveCount(0);
    await expect(page.getByTestId("canonical-samples-error-runbook")).toHaveCount(0);
  });

  test("/?view=canonical-samples&canonicalSamplesFixture=missing shows error headline, detail, runbook", async ({
    page,
  }) => {
    await page.goto("/?view=canonical-samples&canonicalSamplesFixture=missing");
    await expect(page.getByTestId("canonical-samples-error-headline")).toBeVisible();
    await expect(page.getByTestId("canonical-samples-error-headline")).toHaveText("Canonical samples unavailable");
    await expect(page.getByTestId("canonical-samples-error-detail")).toHaveText("Missing canonical bundle");
    await expect(page.getByTestId("canonical-samples-error-runbook")).toBeVisible();
    await expect(page.getByText("Canonical sample bundle (read-only)")).toHaveCount(0);
  });
});
