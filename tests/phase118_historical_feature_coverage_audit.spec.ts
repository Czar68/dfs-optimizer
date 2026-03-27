import {
  buildHistoricalFeatureCoverageAudit,
  formatHistoricalFeatureCoverageMarkdown,
  HISTORICAL_FEATURE_COVERAGE_AUDIT_SCHEMA_VERSION,
} from "../src/reporting/historical_feature_coverage_audit";

describe("Phase 118 — historical feature coverage audit", () => {
  it("buildHistoricalFeatureCoverageAudit returns stable schema + inventory rows", () => {
    const a = buildHistoricalFeatureCoverageAudit({
      generatedAtUtc: "2026-03-22T12:00:00.000Z",
      cwd: process.cwd(),
    });
    expect(a.schemaVersion).toBe(HISTORICAL_FEATURE_COVERAGE_AUDIT_SCHEMA_VERSION);
    expect(a.families.length).toBeGreaterThanOrEqual(8);
    expect(a.summaryLine).toContain("historical_feature_coverage_audit");
    expect(a.registryArtifact.pathRel).toContain("latest_historical_feature_registry.json");
    const ids = new Set(a.families.map((f) => f.id));
    expect(ids.has("rolling_form_binary")).toBe(true);
    expect(ids.has("matchup_context")).toBe(true);
    expect(a.nextImplementationSlice.id).toBe("role_stability_family_taxonomy_alignment");
    expect(a.nextImplementationSlice.justification.length).toBeGreaterThan(0);
  });

  it("formatHistoricalFeatureCoverageMarkdown includes headings and readiness", () => {
    const a = buildHistoricalFeatureCoverageAudit({
      generatedAtUtc: "2026-03-22T12:00:00.000Z",
      cwd: process.cwd(),
    });
    const md = formatHistoricalFeatureCoverageMarkdown(a);
    expect(md).toContain("Historical feature coverage audit");
    expect(md).toContain("## Family inventory");
    expect(md).toContain("partial");
    expect(md).toContain("Recommended next implementation slice");
  });

  it("every family row has grounded evidence strings", () => {
    const a = buildHistoricalFeatureCoverageAudit({
      generatedAtUtc: "2026-03-22T12:00:00.000Z",
      cwd: process.cwd(),
    });
    for (const f of a.families) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(["ready", "partial", "missing", "unclear_legacy"]).toContain(f.readiness);
    }
  });
});
