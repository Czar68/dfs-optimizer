import fs from "fs";
import os from "os";
import path from "path";
import {
  classifyValidationReportingDashboardSync,
  buildValidationReportingFreshnessPayload,
  writeValidationReportingFreshnessArtifacts,
} from "../src/reporting/validation_reporting_freshness";
import { parseValidationReportingFreshnessJson } from "../src/reporting/validation_reporting_freshness_dashboard";

describe("Phase 112 — validation reporting freshness", () => {
  it("classify: missing repo → unknown", () => {
    const x = classifyValidationReportingDashboardSync({
      repoExists: false,
      dashboardExists: false,
      repoMtimeMs: null,
      dashboardMtimeMs: null,
    });
    expect(x.classification).toBe("unknown");
  });

  it("classify: repo exists, dashboard missing → stale", () => {
    const x = classifyValidationReportingDashboardSync({
      repoExists: true,
      dashboardExists: false,
      repoMtimeMs: 100,
      dashboardMtimeMs: null,
    });
    expect(x.classification).toBe("stale");
  });

  it("classify: dashboard older than repo → stale", () => {
    const x = classifyValidationReportingDashboardSync({
      repoExists: true,
      dashboardExists: true,
      repoMtimeMs: 200,
      dashboardMtimeMs: 100,
    });
    expect(x.classification).toBe("stale");
  });

  it("classify: dashboard same or newer mtime → fresh", () => {
    const x = classifyValidationReportingDashboardSync({
      repoExists: true,
      dashboardExists: true,
      repoMtimeMs: 100,
      dashboardMtimeMs: 100,
    });
    expect(x.classification).toBe("fresh");
  });

  it("parse accepts minimal valid freshness JSON", () => {
    const p = parseValidationReportingFreshnessJson({
      classification: "fresh",
      lastValidationReportingRefreshUtc: "2026-03-23T00:00:00.000Z",
      reason: "ok",
      summaryLine: "validation_reporting_freshness status=fresh repo_m=x dash_m=y",
      repoOverviewMtimeUtc: "2026-03-23T00:00:00.000Z",
      dashboardOverviewMtimeUtc: "2026-03-23T00:00:00.000Z",
    });
    expect(p).not.toBeNull();
    expect(p!.classification).toBe("fresh");
  });

  it("writeValidationReportingFreshnessArtifacts produces parseable JSON (grounded)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p112-"));
    const repoDir = path.join(dir, "data", "reports");
    const dashDir = path.join(dir, "web-dashboard", "public", "data", "reports");
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(dashDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, "latest_feature_validation_overview.json"), "{}", "utf8");
    fs.writeFileSync(path.join(dashDir, "latest_feature_validation_overview.json"), "{}", "utf8");
    writeValidationReportingFreshnessArtifacts(dir);
    const j = JSON.parse(
      fs.readFileSync(path.join(dir, "data", "reports", "latest_validation_reporting_freshness.json"), "utf8")
    );
    expect(parseValidationReportingFreshnessJson(j)).not.toBeNull();
    expect(buildValidationReportingFreshnessPayload(dir).classification).toBe("fresh");
  });
});
