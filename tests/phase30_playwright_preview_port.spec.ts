/**
 * Phase 30 — PLAYWRIGHT_PREVIEW_PORT resolution for Playwright webServer / baseURL.
 */
import {
  DEFAULT_PLAYWRIGHT_PREVIEW_PORT,
  resolvePlaywrightPreviewPort,
} from "../playwright.preview.port";

describe("Phase 30 resolvePlaywrightPreviewPort", () => {
  it("defaults to 4173 when unset", () => {
    expect(resolvePlaywrightPreviewPort({})).toBe(DEFAULT_PLAYWRIGHT_PREVIEW_PORT);
  });

  it("honors numeric PLAYWRIGHT_PREVIEW_PORT", () => {
    expect(resolvePlaywrightPreviewPort({ PLAYWRIGHT_PREVIEW_PORT: "4174" })).toBe(4174);
  });

  it("falls back on invalid port", () => {
    expect(resolvePlaywrightPreviewPort({ PLAYWRIGHT_PREVIEW_PORT: "0" })).toBe(DEFAULT_PLAYWRIGHT_PREVIEW_PORT);
    expect(resolvePlaywrightPreviewPort({ PLAYWRIGHT_PREVIEW_PORT: "99999" })).toBe(DEFAULT_PLAYWRIGHT_PREVIEW_PORT);
    expect(resolvePlaywrightPreviewPort({ PLAYWRIGHT_PREVIEW_PORT: "abc" })).toBe(DEFAULT_PLAYWRIGHT_PREVIEW_PORT);
  });
});
