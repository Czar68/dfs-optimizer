import fs from "fs";
import path from "path";
import { inferSide } from "../perf_tracker_types";
import { readTrackerRows } from "../perf_tracker_db";
import { loadSnapshots, resolveCloseOddsFromSnapshots } from "./reconcile_closing_lines";
import { enrichExistingTrackerStartTimes } from "../backfill_perf_tracker";

type SnapshotCoverageGapRow = {
  legId: string;
  player: string;
  stat: string;
  line: number;
  side: "over" | "under";
  gameStartTime: string | null;
  hasPreStartSnapshot: boolean;
  onlyPostStartSnapshots: boolean;
  gapReason: "missing_start_time" | "post_start_only" | "no_snapshot_match";
};

type SnapshotCoverageGaps = {
  generatedAtUtc: string;
  enrichment: {
    scanned: number;
    enriched: number;
    skippedExisting: number;
    skippedNoCandidate: number;
    skippedConflicting: number;
    sourceCounts: Record<string, number>;
  };
  summary: {
    totalRows: number;
    rowsWithStartTime: number;
    rowsMissingStartTime: number;
    rowsWithStartButNoPreStartSnapshot: number;
    rowsPostStartOnly: number;
    rowsNoSnapshotMatch: number;
  };
  rowsNeedingAction: SnapshotCoverageGapRow[];
};

function ensureParent(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function buildSnapshotCoverageGaps(rootDir = process.cwd()): SnapshotCoverageGaps {
  const enrichment = enrichExistingTrackerStartTimes(rootDir);
  const rows = readTrackerRows();
  const snapshots = loadSnapshots(path.join(rootDir, "data", "odds_snapshots"));
  const rowsNeedingAction: SnapshotCoverageGapRow[] = [];
  let rowsWithStartTime = 0;
  let rowsMissingStartTime = 0;
  let rowsWithStartButNoPreStartSnapshot = 0;
  let rowsPostStartOnly = 0;
  let rowsNoSnapshotMatch = 0;

  for (const row of rows) {
    const side = row.side ?? inferSide(row.leg_id);
    if (!row.gameStartTime) {
      rowsMissingStartTime += 1;
      rowsNeedingAction.push({
        legId: row.leg_id,
        player: row.player,
        stat: row.stat,
        line: row.line,
        side,
        gameStartTime: null,
        hasPreStartSnapshot: false,
        onlyPostStartSnapshots: false,
        gapReason: "missing_start_time",
      });
      continue;
    }
    rowsWithStartTime += 1;
    const m = resolveCloseOddsFromSnapshots(snapshots, {
      marketId: row.marketId,
      league: "NBA",
      playerName: row.player,
      stat: row.stat,
      line: row.line,
      side,
      gameStartTime: row.gameStartTime,
    });
    if (m.status === "matched") continue;
    if (m.status === "post_start_only") {
      rowsPostStartOnly += 1;
      rowsWithStartButNoPreStartSnapshot += 1;
      rowsNeedingAction.push({
        legId: row.leg_id,
        player: row.player,
        stat: row.stat,
        line: row.line,
        side,
        gameStartTime: row.gameStartTime,
        hasPreStartSnapshot: false,
        onlyPostStartSnapshots: true,
        gapReason: "post_start_only",
      });
      continue;
    }
    if (m.status === "no_match") {
      rowsNoSnapshotMatch += 1;
      rowsWithStartButNoPreStartSnapshot += 1;
      rowsNeedingAction.push({
        legId: row.leg_id,
        player: row.player,
        stat: row.stat,
        line: row.line,
        side,
        gameStartTime: row.gameStartTime,
        hasPreStartSnapshot: false,
        onlyPostStartSnapshots: false,
        gapReason: "no_snapshot_match",
      });
    }
  }

  rowsNeedingAction.sort((a, b) => {
    const at = a.gameStartTime ?? "9999-99-99T99:99:99Z";
    const bt = b.gameStartTime ?? "9999-99-99T99:99:99Z";
    if (at !== bt) return at.localeCompare(bt);
    if (a.player !== b.player) return a.player.localeCompare(b.player);
    if (a.stat !== b.stat) return a.stat.localeCompare(b.stat);
    if (a.line !== b.line) return a.line - b.line;
    return a.side.localeCompare(b.side);
  });

  return {
    generatedAtUtc: new Date().toISOString(),
    enrichment,
    summary: {
      totalRows: rows.length,
      rowsWithStartTime,
      rowsMissingStartTime,
      rowsWithStartButNoPreStartSnapshot,
      rowsPostStartOnly,
      rowsNoSnapshotMatch,
    },
    rowsNeedingAction,
  };
}

export function exportSnapshotCoverageGaps(options?: { outJsonPath?: string; outMdPath?: string }) {
  const outJsonPath =
    options?.outJsonPath ?? path.join(process.cwd(), "artifacts", "snapshot_coverage_gaps.json");
  const outMdPath =
    options?.outMdPath ?? path.join(process.cwd(), "artifacts", "snapshot_coverage_gaps.md");
  const out = buildSnapshotCoverageGaps();
  ensureParent(outJsonPath);
  fs.writeFileSync(outJsonPath, JSON.stringify(out, null, 2), "utf8");
  const topSources = Object.entries(out.enrichment.sourceCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const md = [
    "# Snapshot Coverage Gaps",
    "",
    `Generated: ${out.generatedAtUtc}`,
    "",
    "## Start-time enrichment",
    `- Scanned rows: ${out.enrichment.scanned}`,
    `- Newly enriched start times: ${out.enrichment.enriched}`,
    `- Skipped (already had start): ${out.enrichment.skippedExisting}`,
    `- Skipped (no candidate): ${out.enrichment.skippedNoCandidate}`,
    `- Skipped (conflicting candidates): ${out.enrichment.skippedConflicting}`,
    `- Source counts: ${topSources || "none"}`,
    "",
    "## Snapshot gap summary",
    `- Total rows: ${out.summary.totalRows}`,
    `- Rows with start time: ${out.summary.rowsWithStartTime}`,
    `- Rows missing start time: ${out.summary.rowsMissingStartTime}`,
    `- Rows with start but no pre-start snapshot: ${out.summary.rowsWithStartButNoPreStartSnapshot}`,
    `- Rows with post-start snapshots only: ${out.summary.rowsPostStartOnly}`,
    `- Rows with no snapshot match: ${out.summary.rowsNoSnapshotMatch}`,
    "",
  ].join("\n");
  fs.writeFileSync(outMdPath, md, "utf8");
  return { outJsonPath, outMdPath, gaps: out };
}

if (require.main === module) {
  const out = exportSnapshotCoverageGaps();
  console.log(`[export:snapshot-gaps] wrote ${out.outJsonPath}`);
  console.log(`[export:snapshot-gaps] wrote ${out.outMdPath}`);
}
