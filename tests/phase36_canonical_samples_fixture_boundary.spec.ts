/**
 * Phase 36 — Intentional boundary: fixture query param/value constants are SSOT in canonical_samples_browser_fixture.ts,
 * not re-exported through web-dashboard/src/lib/canonicalSamples.ts (see module comment there).
 */
import fs from "fs";
import path from "path";

describe("Phase 36 canonical samples fixture constant access boundary", () => {
  it("dashboard canonicalSamples.ts does not re-export fixture query param/value symbols (SSOT stays in reporting/)", () => {
    const p = path.join(process.cwd(), "web-dashboard", "src", "lib", "canonicalSamples.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).not.toContain("CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM");
    expect(src).not.toContain("CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING");
  });

  it("dashboard canonicalSamples.ts still re-exports resolveCanonicalSamplesFetchBase from reporting SSOT", () => {
    const p = path.join(process.cwd(), "web-dashboard", "src", "lib", "canonicalSamples.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("resolveCanonicalSamplesFetchBase");
    expect(src).toContain('from "../../../src/reporting/canonical_samples_browser_fixture"');
  });
});
