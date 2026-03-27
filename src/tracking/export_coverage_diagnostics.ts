import fs from "fs";
import path from "path";
import { readTrackerRows, readTrackerRowsWithResult } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { inferSide } from "../perf_tracker_types";
import { diagnoseClvMatchCoverage, loadSnapshots } from "./reconcile_closing_lines";

type CoverageDiagnostics = {
  generatedAtUtc: string;
  perf: {
    totalRows: number;
    resolvedRows: number;
    rowsWithGameStartTime: number;
    rowsWithPlayerId: number;
    rowsWithMarketId: number;
    rowsWithOpenOdds: number;
    rowsWithCloseOdds: number;
    rowsWithClv: number;
    rowsWithStartButNoPreStartSnapshot: number;
    rowsWithPostStartOnlySnapshots: number;
  };
  clvMatchDiagnostics: {
    scanned: number;
    alreadyPopulated: number;
    matched: number;
    skippedNoStart: number;
    skippedNoMatch: number;
    skippedAmbiguous: number;
    skippedPostStartOnly: number;
  };
};

function countWhere(rows: PerfTrackerRow[], pred: (r: PerfTrackerRow) => boolean): number {
  let n = 0;
  for (const r of rows) if (pred(r)) n += 1;
  return n;
}

export function buildCoverageDiagnostics(rootDir = process.cwd()): CoverageDiagnostics {
  const allRows = readTrackerRows();
  const resolvedRows = readTrackerRowsWithResult();
  const snapshots = loadSnapshots(path.join(rootDir, "data", "odds_snapshots"));
  const diagRows = allRows.map((r) => ({
    marketId: r.marketId,
    league: "NBA",
    playerName: r.player,
    stat: r.stat,
    line: r.line,
    side: r.side ?? inferSide(r.leg_id),
    gameStartTime: r.gameStartTime ?? null,
    closeOddsAmerican: r.closeOddsAmerican,
  }));
  const clvMatchDiagnostics = diagnoseClvMatchCoverage(diagRows, snapshots);
  const rowsWithStartButNoPreStartSnapshot =
    clvMatchDiagnostics.skippedNoMatch + clvMatchDiagnostics.skippedPostStartOnly;
  return {
    generatedAtUtc: new Date().toISOString(),
    perf: {
      totalRows: allRows.length,
      resolvedRows: resolvedRows.length,
      rowsWithGameStartTime: countWhere(allRows, (r) => !!r.gameStartTime),
      rowsWithPlayerId: countWhere(allRows, (r) => typeof r.playerId === "string" && r.playerId.length > 0),
      rowsWithMarketId: countWhere(allRows, (r) => typeof r.marketId === "string" && r.marketId.length > 0),
      rowsWithOpenOdds: countWhere(allRows, (r) => typeof r.openOddsAmerican === "number"),
      rowsWithCloseOdds: countWhere(allRows, (r) => typeof r.closeOddsAmerican === "number"),
      rowsWithClv: countWhere(allRows, (r) => typeof r.clvDelta === "number" && Number.isFinite(r.clvDelta)),
      rowsWithStartButNoPreStartSnapshot,
      rowsWithPostStartOnlySnapshots: clvMatchDiagnostics.skippedPostStartOnly,
    },
    clvMatchDiagnostics,
  };
}

export function exportCoverageDiagnostics(options?: { outJsonPath?: string; outMdPath?: string }) {
  const outJsonPath =
    options?.outJsonPath ?? path.join(process.cwd(), "artifacts", "coverage_diagnostics.json");
  const outMdPath =
    options?.outMdPath ?? path.join(process.cwd(), "artifacts", "coverage_diagnostics.md");
  const d = buildCoverageDiagnostics();
  const dir = path.dirname(outJsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outJsonPath, JSON.stringify(d, null, 2), "utf8");
  const md = [
    "# Coverage Diagnostics",
    "",
    `Generated: ${d.generatedAtUtc}`,
    "",
    "## Perf Coverage",
    `- Total rows: ${d.perf.totalRows}`,
    `- Resolved rows: ${d.perf.resolvedRows}`,
    `- With gameStartTime: ${d.perf.rowsWithGameStartTime}`,
    `- With playerId: ${d.perf.rowsWithPlayerId}`,
    `- With marketId: ${d.perf.rowsWithMarketId}`,
    `- With open odds: ${d.perf.rowsWithOpenOdds}`,
    `- With close odds: ${d.perf.rowsWithCloseOdds}`,
    `- With CLV: ${d.perf.rowsWithClv}`,
    `- With start but no pre-start snapshot: ${d.perf.rowsWithStartButNoPreStartSnapshot}`,
    `- With post-start-only snapshots: ${d.perf.rowsWithPostStartOnlySnapshots}`,
    "",
    "## CLV Match Diagnostics",
    `- Scanned: ${d.clvMatchDiagnostics.scanned}`,
    `- Already populated: ${d.clvMatchDiagnostics.alreadyPopulated}`,
    `- Matchable now: ${d.clvMatchDiagnostics.matched}`,
    `- Skipped no_start: ${d.clvMatchDiagnostics.skippedNoStart}`,
    `- Skipped no_match: ${d.clvMatchDiagnostics.skippedNoMatch}`,
    `- Skipped ambiguous: ${d.clvMatchDiagnostics.skippedAmbiguous}`,
    `- Skipped post_start_only: ${d.clvMatchDiagnostics.skippedPostStartOnly}`,
    "",
  ].join("\n");
  fs.writeFileSync(outMdPath, md, "utf8");
  return { outJsonPath, outMdPath, diagnostics: d };
}

if (require.main === module) {
  const out = exportCoverageDiagnostics();
  console.log(`[export:coverage-diagnostics] wrote ${out.outJsonPath}`);
  console.log(`[export:coverage-diagnostics] wrote ${out.outMdPath}`);
}

