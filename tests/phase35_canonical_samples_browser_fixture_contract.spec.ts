/**
 * Phase 35 — Contract guard for Playwright canonical-samples error-state fixture (query param + value + sentinel base).
 */
import {
  CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM,
  CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING,
  CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE,
  CANONICAL_SAMPLES_PUBLIC_BASE,
  resolveCanonicalSamplesFetchBase,
} from "../src/reporting/canonical_samples_browser_fixture";

describe("Phase 35 canonical samples browser fixture contract", () => {
  it("exports stable query param and missing-fixture value for Playwright URL alignment", () => {
    expect(CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM).toBe("canonicalSamplesFixture");
    expect(CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING).toBe("missing");
  });

  it("maps missing fixture to sentinel base (deterministic error trigger in fetch)", () => {
    const q = `?${CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM}=${CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING}`;
    expect(resolveCanonicalSamplesFetchBase(q)).toBe(CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE);
    expect(
      resolveCanonicalSamplesFetchBase(
        `?view=canonical-samples&${CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM}=${CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING}`
      )
    ).toBe(CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE);
  });

  it("leaves ordinary URLs on the public canonical_samples base", () => {
    expect(resolveCanonicalSamplesFetchBase("")).toBe(CANONICAL_SAMPLES_PUBLIC_BASE);
    expect(resolveCanonicalSamplesFetchBase("?view=canonical-samples")).toBe(CANONICAL_SAMPLES_PUBLIC_BASE);
  });
});
