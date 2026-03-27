import fs from "fs";
import path from "path";
import { buildCoverageDiagnostics } from "./export_coverage_diagnostics";
import { buildSnapshotCoverageGaps } from "./export_snapshot_coverage_gaps";
import { buildCalibrationReadiness, DEFAULT_READINESS_CRITERIA } from "./export_calibration_readiness";
import { readTrackerRows, readTrackerRowsWithResult } from "../perf_tracker_db";

type SourceClassification = {
  source: string;
  classification: "immediately_usable" | "minimal_normalization" | "unsafe_or_ambiguous";
  rationale: string;
};

type ActionItem = {
  priority: number;
  code:
    | "capture_pre_start_snapshots"
    | "recover_missing_start_times"
    | "wait_for_results_grading"
    | "maintain_reconcile_and_exports";
  reason: string;
  command?: string;
  affectedRows?: number;
};

type RowAction = {
  legId: string;
  player: string;
  stat: string;
  line: number;
  gameStartTime: string | null;
  action: "missing_start_time" | "needs_pre_start_snapshot" | "post_start_only" | "already_has_clv";
};

type OpsCoveragePlaybook = {
  generatedAtUtc: string;
  readiness: {
    status: "not_ready" | "partially_ready" | "ready";
    recommendation: "keep_disabled" | "eligible_for_review";
    blockers: string[];
  };
  coverage: ReturnType<typeof buildCoverageDiagnostics>;
  snapshotGaps: ReturnType<typeof buildSnapshotCoverageGaps>;
  sourceAudit: SourceClassification[];
  actionPlan: ActionItem[];
  rowActionSummary: Record<RowAction["action"], number>;
  topRowActions: RowAction[];
};

function ensureParent(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function classifySources(rootDir: string): SourceClassification[] {
  const has = (rel: string) => fs.existsSync(path.join(rootDir, rel));
  const out: SourceClassification[] = [];
  out.push({
    source: "data/output_logs/underdog-legs.json",
    classification: has(path.join("data", "output_logs", "underdog-legs.json"))
      ? "immediately_usable"
      : "unsafe_or_ambiguous",
    rationale:
      "Contains id + player/stat/line + startTime (+ team/opponent), allowing deterministic leg_id/market joins when present.",
  });
  out.push({
    source: "data/output_logs/prizepicks-legs.json",
    classification: has(path.join("data", "output_logs", "prizepicks-legs.json"))
      ? "immediately_usable"
      : "unsafe_or_ambiguous",
    rationale:
      "Same shape as underdog legs JSON for start-time recovery when file exists.",
  });
  out.push({
    source: "data/oddsapi_today.json",
    classification: has(path.join("data", "oddsapi_today.json"))
      ? "minimal_normalization"
      : "unsafe_or_ambiguous",
    rationale:
      "Has playerName/statType/line/commenceTime; safe only as unique market-key fallback with conflict-skip.",
  });
  out.push({
    source: "data/top_legs.json",
    classification: "unsafe_or_ambiguous",
    rationale:
      "No event start time field; insufficient for truthful start-time recovery.",
  });
  out.push({
    source: "data/processed/props-with-ev.json",
    classification: "unsafe_or_ambiguous",
    rationale:
      "Large normalized market dump with weak historical leg-id linkage for reliable perf row enrichment in this phase.",
  });
  return out;
}

function buildRowActions(
  allRows: ReturnType<typeof readTrackerRows>,
  gaps: ReturnType<typeof buildSnapshotCoverageGaps>
): { summary: Record<RowAction["action"], number>; top: RowAction[] } {
  const summary: Record<RowAction["action"], number> = {
    missing_start_time: 0,
    needs_pre_start_snapshot: 0,
    post_start_only: 0,
    already_has_clv: 0,
  };
  const gapMap = new Map<string, RowAction["action"]>();
  for (const g of gaps.rowsNeedingAction) {
    const action: RowAction["action"] =
      g.gapReason === "missing_start_time"
        ? "missing_start_time"
        : g.gapReason === "post_start_only"
          ? "post_start_only"
          : "needs_pre_start_snapshot";
    gapMap.set(g.legId, action);
  }
  const rows: RowAction[] = [];
  for (const row of allRows) {
    const action = gapMap.get(row.leg_id) ?? (typeof row.closeOddsAmerican === "number" ? "already_has_clv" : null);
    if (!action) continue;
    summary[action] += 1;
    rows.push({
      legId: row.leg_id,
      player: row.player,
      stat: row.stat,
      line: row.line,
      gameStartTime: row.gameStartTime ?? null,
      action,
    });
  }
  rows.sort((a, b) => {
    const order = (x: RowAction["action"]) =>
      x === "missing_start_time" ? 0 : x === "post_start_only" ? 1 : x === "needs_pre_start_snapshot" ? 2 : 3;
    const oa = order(a.action);
    const ob = order(b.action);
    if (oa !== ob) return oa - ob;
    const at = a.gameStartTime ?? "9999-99-99T99:99:99Z";
    const bt = b.gameStartTime ?? "9999-99-99T99:99:99Z";
    if (at !== bt) return at.localeCompare(bt);
    if (a.player !== b.player) return a.player.localeCompare(b.player);
    return a.legId.localeCompare(b.legId);
  });
  return { summary, top: rows.slice(0, 15) };
}

function buildActionPlan(playbook: {
  coverage: ReturnType<typeof buildCoverageDiagnostics>;
  gaps: ReturnType<typeof buildSnapshotCoverageGaps>;
  readiness: ReturnType<typeof buildCalibrationReadiness>;
}): ActionItem[] {
  const out: ActionItem[] = [];
  if (playbook.gaps.summary.rowsPostStartOnly > 0) {
    out.push({
      priority: 1,
      code: "capture_pre_start_snapshots",
      reason: "Rows are currently post-start-only and need earlier snapshots to become CLV-eligible.",
      command: "npm run capture:snapshot",
      affectedRows: playbook.gaps.summary.rowsPostStartOnly,
    });
  }
  if (playbook.gaps.summary.rowsMissingStartTime > 0) {
    out.push({
      priority: 2,
      code: "recover_missing_start_times",
      reason: "Rows missing gameStartTime cannot be reconciled for close/CLV.",
      command: "npx ts-node src/backfill_perf_tracker.ts",
      affectedRows: playbook.gaps.summary.rowsMissingStartTime,
    });
  }
  if (playbook.coverage.perf.totalRows > playbook.coverage.perf.resolvedRows) {
    out.push({
      priority: 3,
      code: "wait_for_results_grading",
      reason: "Readiness is limited by unresolved rows; grading/scrape completion increases resolved sample.",
      affectedRows: playbook.coverage.perf.totalRows - playbook.coverage.perf.resolvedRows,
    });
  }
  out.push({
    priority: 4,
    code: "maintain_reconcile_and_exports",
    reason: "Keep CLV/model/readiness artifacts current after snapshot capture and grading.",
    command: "npm run refresh:model-artifacts",
  });
  return out.sort((a, b) => a.priority - b.priority);
}

export function buildOpsCoveragePlaybook(rootDir = process.cwd()): OpsCoveragePlaybook {
  const allRows = readTrackerRows();
  const resolvedRows = readTrackerRowsWithResult();
  const readiness = buildCalibrationReadiness(allRows, resolvedRows, DEFAULT_READINESS_CRITERIA);
  const coverage = buildCoverageDiagnostics(rootDir);
  const gaps = buildSnapshotCoverageGaps(rootDir);
  const sourceAudit = classifySources(rootDir);
  const rowActions = buildRowActions(allRows, gaps);
  const actionPlan = buildActionPlan({ coverage, gaps, readiness });
  return {
    generatedAtUtc: new Date().toISOString(),
    readiness: {
      status: readiness.status,
      recommendation: readiness.activationRecommendation,
      blockers: readiness.blockers,
    },
    coverage,
    snapshotGaps: gaps,
    sourceAudit,
    actionPlan,
    rowActionSummary: rowActions.summary,
    topRowActions: rowActions.top,
  };
}

export function exportOpsCoveragePlaybook(options?: { outJsonPath?: string; outMdPath?: string }) {
  const outJsonPath =
    options?.outJsonPath ?? path.join(process.cwd(), "artifacts", "ops_coverage_playbook.json");
  const outMdPath =
    options?.outMdPath ?? path.join(process.cwd(), "artifacts", "ops_coverage_playbook.md");
  const p = buildOpsCoveragePlaybook();
  ensureParent(outJsonPath);
  fs.writeFileSync(outJsonPath, JSON.stringify(p, null, 2), "utf8");
  const md = [
    "# Ops Coverage Playbook",
    "",
    `Generated: ${p.generatedAtUtc}`,
    "",
    "## Readiness",
    `- Status: ${p.readiness.status}`,
    `- Recommendation: ${p.readiness.recommendation}`,
    ...p.readiness.blockers.map((b) => `- Blocker: ${b}`),
    "",
    "## Coverage Snapshot",
    `- Total rows: ${p.coverage.perf.totalRows}`,
    `- Resolved rows: ${p.coverage.perf.resolvedRows}`,
    `- Rows with CLV: ${p.coverage.perf.rowsWithClv}`,
    `- Rows missing start time: ${p.snapshotGaps.summary.rowsMissingStartTime}`,
    `- Rows post-start-only: ${p.snapshotGaps.summary.rowsPostStartOnly}`,
    "",
    "## Priority Actions",
    ...p.actionPlan.map((a) => `- [P${a.priority}] ${a.code}: ${a.reason}${a.command ? ` (run: \`${a.command}\`)` : ""}`),
    "",
  ].join("\n");
  fs.writeFileSync(outMdPath, md, "utf8");
  return { outJsonPath, outMdPath, playbook: p };
}

if (require.main === module) {
  const out = exportOpsCoveragePlaybook();
  console.log(`[export:ops-playbook] wrote ${out.outJsonPath}`);
  console.log(`[export:ops-playbook] wrote ${out.outMdPath}`);
}
