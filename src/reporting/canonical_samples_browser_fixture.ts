/**
 * Phase 29 — Browser test fixture for canonical samples dashboard fetch base (Playwright only).
 * `canonicalSamplesFixture=missing` resolves to CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE; `fetchCanonicalSampleArtifactsForDashboard`
 * throws the same 404-shaped error as a missing PP JSON (Vite preview may return 200+HTML for unknown paths — see web-dashboard fetch).
 */

export const CANONICAL_SAMPLES_PUBLIC_BASE = "./data/canonical_samples";

/** Sentinel base when `canonicalSamplesFixture=missing` — no real files; consumer throws 404-equivalent before network. */
export const CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE = "./data/canonical_samples__fixture_missing";

/** Query param name for Playwright error-state fixture (Phase 29/35 contract guard). */
export const CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM = "canonicalSamplesFixture";

/** Supported value: forces missing-bundle / 404-equivalent path for browser tests. */
export const CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING = "missing";

/**
 * Resolves fetch base from `window.location.search`. Only
 * `canonicalSamplesFixture=missing` is supported (deterministic 404).
 */
export function resolveCanonicalSamplesFetchBase(search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  if (
    params.get(CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM) ===
    CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING
  ) {
    return CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE;
  }
  return CANONICAL_SAMPLES_PUBLIC_BASE;
}
