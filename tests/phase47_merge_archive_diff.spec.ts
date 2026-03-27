/**
 * Phase 47 — Merge archive + diff tooling (no merge execution).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ARCHIVED_FILE_NAMES,
  archiveMergeArtifacts,
  buildMergeArchiveDiffReport,
  formatMergeArchiveDiffMarkdown,
  mergeArchiveRootRel,
  resolveSnapshotIdFromReports,
  sanitizeSnapshotIdForPath,
} from "../src/reporting/merge_archive_diff";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

describe("Phase 47 sanitizeSnapshotIdForPath", () => {
  it("replaces colons for safe directory names", () => {
    expect(sanitizeSnapshotIdForPath("2026-03-21T15:06:42.850Z")).toBe("2026-03-21T15-06-42.850Z");
  });
});

describe("Phase 47 archiveMergeArtifacts", () => {
  it("writes deterministic manifest and stable JSON", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m47-"));
    const rd = path.join(tmp, "data", "reports");
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(
      path.join(rd, "merge_quality_status.json"),
      JSON.stringify({
        generatedAtUtc: "2026-01-02T03:04:05.000Z",
        overallSeverity: "INFO",
        keyMetrics: { mergeCoverage: 1, dropRate: 0, fallbackRate: 0 },
      }),
      "utf8"
    );
    fs.writeFileSync(path.join(rd, "latest_merge_audit.json"), JSON.stringify({ generatedAtUtc: "2026-01-02T03:04:05.000Z", totals: { matched: 1, dropped: 0, rawProps: 1 } }), "utf8");
    fs.writeFileSync(path.join(rd, "latest_merge_quality.json"), "{}", "utf8");
    fs.writeFileSync(path.join(rd, "latest_merge_diagnostics.json"), JSON.stringify({ drops: { byStatCanonical: {} } }), "utf8");

    const { destDir, snapshotId, manifest } = archiveMergeArtifacts(tmp, { label: "test-run" });
    expect(snapshotId).toContain("2026-01-02T03-04-05.000Z");
    expect(snapshotId).toContain("test-run");
    expect(fs.existsSync(path.join(destDir, ARCHIVED_FILE_NAMES.manifest))).toBe(true);
    expect(fs.existsSync(path.join(destDir, ARCHIVED_FILE_NAMES.status))).toBe(true);
    const raw = fs.readFileSync(path.join(destDir, ARCHIVED_FILE_NAMES.manifest), "utf8");
    const twice = stableStringifyForObservability(JSON.parse(raw));
    expect(twice).toBe(stableStringifyForObservability(JSON.parse(twice)));
    expect(manifest.entries.filter((e) => e.copied).length).toBeGreaterThan(0);
  });
});

describe("Phase 47 buildMergeArchiveDiffReport", () => {
  it("computes deltas and deterministic markdown", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m47d-"));
    const left = path.join(tmp, "left");
    const right = path.join(tmp, "right");
    fs.mkdirSync(left, { recursive: true });
    fs.mkdirSync(right, { recursive: true });

    fs.writeFileSync(
      path.join(left, ARCHIVED_FILE_NAMES.status),
      JSON.stringify({
        generatedAtUtc: "a",
        overallSeverity: "INFO",
        keyMetrics: { mergeCoverage: 0.8, dropRate: 0.1, fallbackRate: 0.05 },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(right, ARCHIVED_FILE_NAMES.status),
      JSON.stringify({
        generatedAtUtc: "b",
        overallSeverity: "WARN",
        keyMetrics: { mergeCoverage: 0.9, dropRate: 0.05, fallbackRate: 0.02 },
      }),
      "utf8"
    );

    fs.writeFileSync(
      path.join(left, ARCHIVED_FILE_NAMES.audit),
      JSON.stringify({
        droppedByCanonicalReason: { no_match: 10 },
        totals: { matched: 80, dropped: 20, rawProps: 100 },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(right, ARCHIVED_FILE_NAMES.audit),
      JSON.stringify({
        droppedByCanonicalReason: { no_match: 8, line_mismatch: 2 },
        totals: { matched: 90, dropped: 10, rawProps: 100 },
      }),
      "utf8"
    );

    fs.writeFileSync(
      path.join(left, ARCHIVED_FILE_NAMES.diagnostics),
      JSON.stringify({
        drops: {
          bySiteCanonical: {},
          byStatCanonical: { points: { no_match: 5 } },
          bySportCanonical: {},
        },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(right, ARCHIVED_FILE_NAMES.diagnostics),
      JSON.stringify({
        drops: {
          bySiteCanonical: {},
          byStatCanonical: { points: { no_match: 3 } },
          bySportCanonical: {},
        },
      }),
      "utf8"
    );

    const d = buildMergeArchiveDiffReport(left, right);
    expect(d.keyMetrics.mergeCoverageDelta).toBeCloseTo(0.1, 6);
    expect(d.keyMetrics.dropRateDelta).toBeCloseTo(-0.05, 6);
    expect(d.keyMetrics.fallbackRateDelta).toBeCloseTo(-0.03, 6);
    expect(d.keyMetrics.severity).toEqual({ left: "INFO", right: "WARN" });
    expect(d.auditTotals.matchedDelta).toBe(10);
    expect(d.auditTotals.droppedDelta).toBe(-10);
    expect(d.droppedByCanonicalReasonDelta.no_match).toBe(-2);
    expect(d.droppedByCanonicalReasonDelta.line_mismatch).toBe(2);
    expect(d.diagnosticsByStatCanonicalDeltaLines.some((l) => l.includes("points"))).toBe(true);

    const md = formatMergeArchiveDiffMarkdown(d);
    expect(md).toContain("Merge archive diff");
    expect(md).toContain("mergeCoverage: Δ");
    const md2 = formatMergeArchiveDiffMarkdown(d);
    expect(md2).toBe(md);
  });
});

describe("Phase 47 resolveSnapshotIdFromReports", () => {
  it("reads status generatedAtUtc when present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m47r-"));
    const rd = path.join(tmp, "data", "reports");
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(
      path.join(rd, "merge_quality_status.json"),
      JSON.stringify({ generatedAtUtc: "2026-03-01T12:00:00.000Z" }),
      "utf8"
    );
    expect(resolveSnapshotIdFromReports(tmp)).toBe("2026-03-01T12-00-00.000Z");
  });
});

describe("Phase 47 mergeArchiveRootRel", () => {
  it("uses data/reports/merge_archive", () => {
    expect(mergeArchiveRootRel().replace(/\\/g, "/")).toBe("data/reports/merge_archive");
  });
});
