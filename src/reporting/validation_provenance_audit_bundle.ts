/**
 * Phase 114 — Compact audit bundle for validation/provenance wiring (read-only; no math).
 */

import fs from "fs";
import path from "path";
import { stableStringifyForObservability } from "./final_selection_observability";
import { resolveEffectiveFeatureValidationPolicy } from "./export_feature_validation_overview";
import { DASHBOARD_SYNC_REQUIRED_FILES, DASHBOARD_SYNC_OPTIONAL_FILES } from "./dashboard_sync_contract";

export const VALIDATION_PROVENANCE_AUDIT_BUNDLE_JSON = path.join(
  "data",
  "reports",
  "latest_validation_provenance_audit_bundle.json"
);
export const VALIDATION_PROVENANCE_AUDIT_BUNDLE_MD = path.join(
  "data",
  "reports",
  "latest_validation_provenance_audit_bundle.md"
);

const REPO_REPORTS = path.join("data", "reports");
const PUBLIC_REPORTS = path.join("web-dashboard", "public", "data", "reports");
const RUNBOOK = path.join("docs", "VALIDATION_PROVENANCE_RUNBOOK.md");

function exists(cwd: string, rel: string): boolean {
  return fs.existsSync(path.join(cwd, rel));
}

function readJsonField<T>(abs: string, pick: (o: Record<string, unknown>) => T | null): T | null {
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
    return pick(raw);
  } catch {
    return null;
  }
}

export type DashboardSyncVisibility = "proven" | "partial" | "missing";

export function classifyDashboardSyncVisibilityProof(opts: {
  repoOverview: boolean;
  dashboardOverview: boolean;
  repoFreshness: boolean;
  dashboardFreshness: boolean;
}): DashboardSyncVisibility {
  if (!opts.repoOverview) return "missing";
  if (!opts.dashboardOverview) return "missing";
  if (opts.repoFreshness && opts.dashboardFreshness) return "proven";
  if (!opts.repoFreshness && !opts.dashboardFreshness) return "partial";
  return "partial";
}

export type ValidationProvenanceAuditBundle = {
  generatedAtUtc: string;
  effectiveValidationPolicy: string;
  artifacts: {
    replayReadinessJson: { rel: string; present: boolean };
    legsSnapshotAdoptionJson: { rel: string; present: boolean };
    featureValidationOverviewJson: { rel: string; present: boolean };
    validationReportingFreshnessJson: { rel: string; present: boolean };
    featureValidationPolicyStatusJson: { rel: string; present: boolean };
    trackerSnapshotNewRowEnforcementJson: { rel: string; present: boolean };
  };
  overviewEffectivePolicyFromArtifact: string | null;
  freshnessClassificationFromArtifact: string | null;
  runbook: { rel: string; present: boolean };
  dashboardExportProof: {
    repoOverviewJsonExists: boolean;
    syncedDashboardOverviewJsonExists: boolean;
    repoFreshnessJsonExists: boolean;
    syncedDashboardFreshnessJsonExists: boolean;
    dashboardSyncVisibility: DashboardSyncVisibility;
    requiredPipelineJsonInPublicCount: number;
    optionalValidationJsonInPublicCount: number;
  };
  summaryLine: string;
};

function countPresent(cwd: string, dir: string, names: readonly string[]): number {
  let n = 0;
  for (const name of names) {
    if (exists(cwd, path.join(dir, name))) n += 1;
  }
  return n;
}

export function formatValidationProvenanceAuditSummaryLine(b: ValidationProvenanceAuditBundle): string {
  const p = b.dashboardExportProof;
  return (
    `validation_provenance_audit_bundle sync=${p.dashboardSyncVisibility} ` +
    `repo_ov=${b.artifacts.featureValidationOverviewJson.present ? 1 : 0} ` +
    `pub_ov=${p.syncedDashboardOverviewJsonExists ? 1 : 0} ` +
    `repo_fr=${b.artifacts.validationReportingFreshnessJson.present ? 1 : 0} ` +
    `pub_fr=${p.syncedDashboardFreshnessJsonExists ? 1 : 0} ` +
    `runbook=${b.runbook.present ? 1 : 0}`
  );
}

export function buildValidationProvenanceAuditBundle(cwd: string): ValidationProvenanceAuditBundle {
  const rel = (f: string) => path.join(REPO_REPORTS, f).replace(/\\/g, "/");
  const repoOv = rel("latest_feature_validation_overview.json");
  const repoFr = rel("latest_validation_reporting_freshness.json");
  const pubOv = path.join(PUBLIC_REPORTS, "latest_feature_validation_overview.json").replace(/\\/g, "/");
  const pubFr = path.join(PUBLIC_REPORTS, "latest_validation_reporting_freshness.json").replace(/\\/g, "/");

  const repoOverviewExists = exists(cwd, repoOv);
  const dashOverviewExists = exists(cwd, pubOv);
  const repoFreshnessExists = exists(cwd, repoFr);
  const dashFreshnessExists = exists(cwd, pubFr);

  const overviewAbs = path.join(cwd, "data", "reports", "latest_feature_validation_overview.json");
  const freshnessAbs = path.join(cwd, "data", "reports", "latest_validation_reporting_freshness.json");

  const overviewPolicy = repoOverviewExists
    ? readJsonField(overviewAbs, (o) =>
        typeof o.effectivePolicy === "string" && o.effectivePolicy.trim() ? o.effectivePolicy.trim() : null
      )
    : null;
  const freshnessClass = repoFreshnessExists
    ? readJsonField(freshnessAbs, (o) =>
        o.classification === "fresh" || o.classification === "stale" || o.classification === "unknown"
          ? o.classification
          : null
      )
    : null;

  const visibility = classifyDashboardSyncVisibilityProof({
    repoOverview: repoOverviewExists,
    dashboardOverview: dashOverviewExists,
    repoFreshness: repoFreshnessExists,
    dashboardFreshness: dashFreshnessExists,
  });

  const bundle: ValidationProvenanceAuditBundle = {
    generatedAtUtc: new Date().toISOString(),
    effectiveValidationPolicy: resolveEffectiveFeatureValidationPolicy(),
    artifacts: {
      replayReadinessJson: { rel: rel("latest_feature_validation_replay_readiness.json"), present: exists(cwd, rel("latest_feature_validation_replay_readiness.json")) },
      legsSnapshotAdoptionJson: { rel: rel("latest_legs_snapshot_adoption.json"), present: exists(cwd, rel("latest_legs_snapshot_adoption.json")) },
      featureValidationOverviewJson: { rel: repoOv, present: repoOverviewExists },
      validationReportingFreshnessJson: { rel: repoFr, present: repoFreshnessExists },
      featureValidationPolicyStatusJson: {
        rel: rel("latest_feature_validation_policy_status.json"),
        present: exists(cwd, rel("latest_feature_validation_policy_status.json")),
      },
      trackerSnapshotNewRowEnforcementJson: {
        rel: rel("latest_tracker_snapshot_new_row_enforcement.json"),
        present: exists(cwd, rel("latest_tracker_snapshot_new_row_enforcement.json")),
      },
    },
    overviewEffectivePolicyFromArtifact: overviewPolicy,
    freshnessClassificationFromArtifact: freshnessClass,
    runbook: { rel: RUNBOOK.replace(/\\/g, "/"), present: exists(cwd, RUNBOOK) },
    dashboardExportProof: {
      repoOverviewJsonExists: repoOverviewExists,
      syncedDashboardOverviewJsonExists: dashOverviewExists,
      repoFreshnessJsonExists: repoFreshnessExists,
      syncedDashboardFreshnessJsonExists: dashFreshnessExists,
      dashboardSyncVisibility: visibility,
      requiredPipelineJsonInPublicCount: countPresent(cwd, PUBLIC_REPORTS, DASHBOARD_SYNC_REQUIRED_FILES),
      optionalValidationJsonInPublicCount: countPresent(cwd, PUBLIC_REPORTS, DASHBOARD_SYNC_OPTIONAL_FILES),
    },
    summaryLine: "",
  };
  bundle.summaryLine = formatValidationProvenanceAuditSummaryLine(bundle);
  return bundle;
}

export function writeValidationProvenanceAuditBundleArtifacts(cwd: string): ValidationProvenanceAuditBundle {
  const bundle = buildValidationProvenanceAuditBundle(cwd);
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(cwd, VALIDATION_PROVENANCE_AUDIT_BUNDLE_JSON);
  fs.writeFileSync(jsonPath, stableStringifyForObservability(bundle), "utf8");
  const mdPath = path.join(cwd, VALIDATION_PROVENANCE_AUDIT_BUNDLE_MD);
  const p = bundle.dashboardExportProof;
  const lines = [
    "# Validation / provenance — audit bundle (Phase 114)",
    "",
    `- **summary:** \`${bundle.summaryLine}\``,
    `- **generatedAtUtc:** ${bundle.generatedAtUtc}`,
    `- **effectiveValidationPolicy (env/default):** ${bundle.effectiveValidationPolicy}`,
    `- **overview effectivePolicy (artifact):** ${bundle.overviewEffectivePolicyFromArtifact ?? "—"}`,
    `- **freshness classification (artifact):** ${bundle.freshnessClassificationFromArtifact ?? "—"}`,
    "",
    "## Dashboard export proof",
    "",
    `- **repo overview JSON:** ${p.repoOverviewJsonExists}`,
    `- **public dashboard overview JSON:** ${p.syncedDashboardOverviewJsonExists}`,
    `- **repo freshness JSON:** ${p.repoFreshnessJsonExists}`,
    `- **public freshness JSON:** ${p.syncedDashboardFreshnessJsonExists}`,
    `- **dashboardSyncVisibility:** ${p.dashboardSyncVisibility}`,
    `- **required pipeline JSON in public (count / ${DASHBOARD_SYNC_REQUIRED_FILES.length}):** ${p.requiredPipelineJsonInPublicCount}`,
    `- **optional validation JSON in public (count / ${DASHBOARD_SYNC_OPTIONAL_FILES.length}):** ${p.optionalValidationJsonInPublicCount}`,
    "",
    "## Artifact presence (repo)",
    "",
    ...Object.values(bundle.artifacts).map((a) => `- **${a.rel}:** ${a.present}`),
    "",
    "## Runbook",
    "",
    `- **${bundle.runbook.rel}:** ${bundle.runbook.present}`,
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return bundle;
}
