/**
 * Phase 42 — Merge quality operator hooks (console + optional exit); verify script.
 */
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { parseArgs } from "../src/cli_args";
import type { MergeAuditSnapshot } from "../src/reporting/merge_audit";
import {
  MERGE_QUALITY_STATUS_SCHEMA_VERSION,
  type MergeQualityStatusFile,
} from "../src/reporting/merge_quality";
import { applyMergeQualityOperatorHooks } from "../src/reporting/merge_quality_operator";

const repoRoot = path.join(__dirname, "..");

function makeSnapshot(overrides: Partial<MergeQualityStatusFile>): MergeAuditSnapshot {
  const sev = overrides.overallSeverity ?? "INFO";
  const mergeQualityStatus: MergeQualityStatusFile = {
    schemaVersion: MERGE_QUALITY_STATUS_SCHEMA_VERSION,
    generatedAtUtc: "2026-01-01T00:00:00.000Z",
    overallSeverity: sev,
    liveInputDegraded: overrides.liveInputDegraded ?? sev !== "INFO",
    explanation: overrides.explanation ?? "ok",
    keyMetrics: {
      mergeCoverage: overrides.keyMetrics?.mergeCoverage ?? 0.9,
      fallbackRate: overrides.keyMetrics?.fallbackRate ?? 0.01,
      dropRate: overrides.keyMetrics?.dropRate ?? 0,
    },
    liveMergeQualityLine:
      overrides.liveMergeQualityLine ??
      "match_rate_pp=0.5000 match_rate_ud=null unmatched_legs=0 alias_rate=0.0000 drop_no_market=0 drop_line_diff=0",
    driftNote: overrides.driftNote ?? null,
    triggeredRules: overrides.triggeredRules ?? [],
    baseline: overrides.baseline ?? { available: false, seededThisRun: false },
  };
  return {
    dropRecords: [],
    altLineFallbackCount: 0,
    exactLineMatchCount: 0,
    nearestWithinToleranceCount: 0,
    mergedLineDeltaHistogram: {},
    mergeQualityStatus,
  };
}

describe("Phase 42 merge operator hooks", () => {
  it("prints deterministic paths and summary lines", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const snap = makeSnapshot({ overallSeverity: "INFO" });
    applyMergeQualityOperatorHooks(parseArgs([]), snap);
    const joined = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("MERGE QUALITY REPORTS:");
    expect(joined).toContain("data/reports/latest_merge_quality.json");
    expect(joined).toContain("data/reports/merge_quality_status.json");
    expect(joined).toContain("MERGE QUALITY: INFO");
    expect(joined).toContain("liveInputDegraded: false");
    expect(joined).toContain("match_rate_pp=");
    expect(joined).toContain("coverage: 0.9000");
    expect(joined).toContain("fallbackRate: 0.0100");
    log.mockRestore();
  });

  it("prints drift line when driftNote present", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const snap = makeSnapshot({
      overallSeverity: "WARN",
      driftNote: "coverageDelta=0.0100",
    });
    applyMergeQualityOperatorHooks(parseArgs([]), snap);
    expect(log.mock.calls.map((c) => String(c[0])).some((l) => l.includes("drift: coverageDelta=0.0100"))).toBe(
      true
    );
    log.mockRestore();
  });

  it("exits 1 when FAIL and --fail-on-merge-quality", () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const snap = makeSnapshot({ overallSeverity: "FAIL" });
    applyMergeQualityOperatorHooks(parseArgs(["--fail-on-merge-quality"]), snap);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("does not exit when FAIL and enforcement off", () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const snap = makeSnapshot({ overallSeverity: "FAIL" });
    applyMergeQualityOperatorHooks(parseArgs([]), snap);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("MERGE_QUALITY_ENFORCE=true enables fail-on-FAIL", () => {
    const prev = process.env.MERGE_QUALITY_ENFORCE;
    process.env.MERGE_QUALITY_ENFORCE = "true";
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
    try {
      const snap = makeSnapshot({ overallSeverity: "FAIL" });
      applyMergeQualityOperatorHooks(parseArgs([]), snap);
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      if (prev === undefined) delete process.env.MERGE_QUALITY_ENFORCE;
      else process.env.MERGE_QUALITY_ENFORCE = prev;
    }
  });
});

describe("Phase 42 verify_merge_quality_canonical script", () => {
  const script = path.join(repoRoot, "scripts", "verify_merge_quality_canonical.ts");

  it("exits 0 when status file missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mqv-"));
    const out = execSync(`npx ts-node "${script}"`, {
      cwd: tmp,
      encoding: "utf8",
    });
    expect(out).toContain("MERGE QUALITY VERIFY:");
    expect(out).toContain("missing");
  });

  it("exits 0 on FAIL when enforce off", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mqv-"));
    const dir = path.join(tmp, "data", "reports");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "merge_quality_status.json"), JSON.stringify({ overallSeverity: "FAIL" }), "utf8");
    const out = execSync(`npx ts-node "${script}"`, {
      cwd: tmp,
      encoding: "utf8",
    });
    expect(out).toContain("MERGE QUALITY VERIFY: FAIL");
    expect(out).toContain("MERGE_QUALITY_ENFORCE=true");
  });

  it("exits 1 on FAIL when MERGE_QUALITY_ENFORCE=true", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mqv-"));
    const dir = path.join(tmp, "data", "reports");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "merge_quality_status.json"), JSON.stringify({ overallSeverity: "FAIL" }), "utf8");
    expect(() =>
      execSync(`npx ts-node "${script}"`, {
        cwd: tmp,
        encoding: "utf8",
        env: { ...process.env, MERGE_QUALITY_ENFORCE: "true" },
      })
    ).toThrow();
  });
});
