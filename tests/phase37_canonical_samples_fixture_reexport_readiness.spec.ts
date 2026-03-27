/**
 * Phase 37 — Re-export readiness (no new dashboard re-exports in this phase).
 *
 * When a dashboard consumer needs `CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM` /
 * `CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING`:
 * 1. Add them only to the existing `export { ... } from "../../../src/reporting/canonical_samples_browser_fixture"` block
 *    in `web-dashboard/src/lib/canonicalSamples.ts` (same bindings — no string literals for fixture values in that file).
 * 2. Add `expect(Object.is(qSsot, qBarrel)).toBe(true)` for each symbol (import SSOT + import barrel via a path Jest can resolve,
 *    or keep barrel-only usage in dashboard tests).
 * 3. Update `tests/phase36_canonical_samples_fixture_boundary.spec.ts` — relax the negative assertion that forbids those
 *    identifier names in `canonicalSamples.ts`.
 *
 * SSOT remains `src/reporting/canonical_samples_browser_fixture.ts` only.
 */
import fs from "fs";
import path from "path";

describe("Phase 37 canonical samples fixture re-export readiness", () => {
  it("canonicalSamples.ts uses one consistent relative path to the fixture SSOT module for all re-exports", () => {
    const p = path.join(process.cwd(), "web-dashboard", "src", "lib", "canonicalSamples.ts");
    const src = fs.readFileSync(p, "utf8");
    const rel = "../../../src/reporting/canonical_samples_browser_fixture";
    const matches = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const ssotRefs = matches.filter((m) => m.includes("canonical_samples_browser_fixture"));
    expect(ssotRefs.length).toBeGreaterThan(0);
    expect(new Set(ssotRefs).size).toBe(1);
    expect(ssotRefs[0]).toBe(rel);
  });
});
