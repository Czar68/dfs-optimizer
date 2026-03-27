import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightPreviewPort } from "./playwright.preview.port";

const previewPort = resolvePlaywrightPreviewPort();
const baseURL = `http://127.0.0.1:${previewPort}`;

/**
 * Phase 25 — Canonical samples UI smoke only (see tests/playwright/).
 * Phase 30 — Port from PLAYWRIGHT_PREVIEW_PORT (default 4173); reuse rules documented in docs/CANONICAL_SAMPLES_DASHBOARD.md.
 */
const reusePreviewServer =
  !process.env.CI && process.env.PW_DISABLE_PREVIEW_REUSE !== "1";

export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npm run build --prefix web-dashboard && npm run preview --prefix web-dashboard -- --host 127.0.0.1 --port ${previewPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: reusePreviewServer,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
