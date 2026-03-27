import fs from "fs";
import os from "os";
import path from "path";
import {
  buildValidationProvenanceAuditBundle,
  classifyDashboardSyncVisibilityProof,
  formatValidationProvenanceAuditSummaryLine,
  writeValidationProvenanceAuditBundleArtifacts,
} from "../src/reporting/validation_provenance_audit_bundle";
import { DASHBOARD_SYNC_OPTIONAL_FILES, DASHBOARD_SYNC_REQUIRED_FILES } from "../src/reporting/dashboard_sync_contract";

describe("Phase 114 — validation provenance audit bundle", () => {
  it("classifyDashboardSyncVisibilityProof: proven vs missing vs partial", () => {
    expect(
      classifyDashboardSyncVisibilityProof({
        repoOverview: false,
        dashboardOverview: false,
        repoFreshness: false,
        dashboardFreshness: false,
      })
    ).toBe("missing");
    expect(
      classifyDashboardSyncVisibilityProof({
        repoOverview: true,
        dashboardOverview: false,
        repoFreshness: false,
        dashboardFreshness: false,
      })
    ).toBe("missing");
    expect(
      classifyDashboardSyncVisibilityProof({
        repoOverview: true,
        dashboardOverview: true,
        repoFreshness: false,
        dashboardFreshness: false,
      })
    ).toBe("partial");
    expect(
      classifyDashboardSyncVisibilityProof({
        repoOverview: true,
        dashboardOverview: true,
        repoFreshness: true,
        dashboardFreshness: true,
      })
    ).toBe("proven");
    expect(
      classifyDashboardSyncVisibilityProof({
        repoOverview: true,
        dashboardOverview: true,
        repoFreshness: true,
        dashboardFreshness: false,
      })
    ).toBe("partial");
  });

  it("bundle required fields and deterministic summary for fixed fixture layout", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p114-audit-"));
    const dr = path.join(dir, "data", "reports");
    const pub = path.join(dir, "web-dashboard", "public", "data", "reports");
    fs.mkdirSync(dr, { recursive: true });
    fs.mkdirSync(pub, { recursive: true });
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "VALIDATION_PROVENANCE_RUNBOOK.md"), "# x\n", "utf8");
    for (const n of [
      "latest_feature_validation_replay_readiness.json",
      "latest_legs_snapshot_adoption.json",
      "latest_feature_validation_policy_status.json",
    ]) {
      fs.writeFileSync(path.join(dr, n), "{}", "utf8");
    }
    fs.writeFileSync(
      path.join(dr, "latest_feature_validation_overview.json"),
      JSON.stringify({ effectivePolicy: "snapshot_preferred" }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(dr, "latest_validation_reporting_freshness.json"),
      JSON.stringify({ classification: "fresh" }),
      "utf8"
    );
    fs.writeFileSync(path.join(pub, "latest_feature_validation_overview.json"), "{}", "utf8");
    fs.writeFileSync(path.join(pub, "latest_validation_reporting_freshness.json"), "{}", "utf8");
    for (const n of [
      "latest_run_status.json",
      "latest_pre_diversification_card_diagnosis.json",
      "latest_card_ev_viability.json",
      "latest_historical_feature_registry.json",
    ]) {
      fs.writeFileSync(path.join(pub, n), "{}", "utf8");
    }

    const a = buildValidationProvenanceAuditBundle(dir);
    const b = buildValidationProvenanceAuditBundle(dir);
    expect(a.dashboardExportProof.dashboardSyncVisibility).toBe("proven");
    expect(a.summaryLine).toBe(b.summaryLine);
    expect(a.runbook.present).toBe(true);
    expect(a.artifacts.featureValidationOverviewJson.present).toBe(true);
    expect(formatValidationProvenanceAuditSummaryLine(a)).toBe(a.summaryLine);
  });

  it("sync:dashboard-reports imports dashboard_sync_contract (SSOT; no duplicate file lists)", () => {
    const t = fs.readFileSync(path.join(process.cwd(), "scripts", "sync_dashboard_reports.ts"), "utf8");
    expect(t).toContain('from "../src/reporting/dashboard_sync_contract"');
    expect(t).not.toMatch(/const\s+\w+\s*=\s*\[[\s\S]*latest_run_status\.json/);
  });

  it("bundle public JSON counts align with contract array lengths", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p114-cnt-"));
    fs.mkdirSync(path.join(dir, "web-dashboard", "public", "data", "reports"), { recursive: true });
    for (const n of DASHBOARD_SYNC_REQUIRED_FILES) {
      fs.writeFileSync(path.join(dir, "web-dashboard", "public", "data", "reports", n), "{}", "utf8");
    }
    for (const n of DASHBOARD_SYNC_OPTIONAL_FILES) {
      fs.writeFileSync(path.join(dir, "web-dashboard", "public", "data", "reports", n), "{}", "utf8");
    }
    const b = buildValidationProvenanceAuditBundle(dir);
    expect(b.dashboardExportProof.requiredPipelineJsonInPublicCount).toBe(DASHBOARD_SYNC_REQUIRED_FILES.length);
    expect(b.dashboardExportProof.optionalValidationJsonInPublicCount).toBe(DASHBOARD_SYNC_OPTIONAL_FILES.length);
  });

  it("writeValidationProvenanceAuditBundleArtifacts writes parseable JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p114-w-"));
    fs.mkdirSync(path.join(dir, "data", "reports"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "VALIDATION_PROVENANCE_RUNBOOK.md"), "#\n", "utf8");
    writeValidationProvenanceAuditBundleArtifacts(dir);
    const p = path.join(dir, "data", "reports", "latest_validation_provenance_audit_bundle.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { summaryLine: string; dashboardExportProof: unknown };
    expect(raw.summaryLine).toContain("validation_provenance_audit_bundle");
    expect(raw.dashboardExportProof).toBeDefined();
  });
});
