/**
 * Phase 29 — Query-param resolution for canonical samples browser test fixture (no dashboard imports).
 */
import {
  CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE,
  CANONICAL_SAMPLES_PUBLIC_BASE,
  resolveCanonicalSamplesFetchBase,
} from "../src/reporting/canonical_samples_browser_fixture";

describe("Phase 29 canonical samples browser fixture base", () => {
  it("defaults to public canonical_samples base", () => {
    expect(resolveCanonicalSamplesFetchBase("")).toBe(CANONICAL_SAMPLES_PUBLIC_BASE);
    expect(resolveCanonicalSamplesFetchBase("?view=canonical-samples")).toBe(CANONICAL_SAMPLES_PUBLIC_BASE);
  });

  it("canonicalSamplesFixture=missing uses deterministic non-existent path", () => {
    expect(resolveCanonicalSamplesFetchBase("?canonicalSamplesFixture=missing")).toBe(
      CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE
    );
    expect(CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE).toContain("__fixture_missing");
  });

  it("ignores unknown fixture values", () => {
    expect(resolveCanonicalSamplesFetchBase("?canonicalSamplesFixture=other")).toBe(CANONICAL_SAMPLES_PUBLIC_BASE);
  });
});
