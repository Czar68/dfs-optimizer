/**
 * Phase 53 — `no_candidate` drops rolled up by normalized pick player key (reporting only).
 * Caller supplies `normalizePickPlayerKey` (typically `normalizePickPlayerKeyForDiagnostics` from `merge_odds`)
 * so reporting does not import `merge_odds` (avoids circular dependency with `merge_audit`).
 */

import fs from "fs";
import path from "path";
import type { MergeDropRecord } from "../merge_contract";
import { stableStringifyForObservability } from "./final_selection_observability";

export const MERGE_PLAYER_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

const JSON_NAME = "latest_merge_player_diagnostics.json";
const MD_NAME = "latest_merge_player_diagnostics.md";

export function getMergePlayerDiagnosticsPaths(cwd: string): { dir: string; jsonPath: string; mdPath: string } {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

function bumpNested(
  out: Record<string, Record<string, number>>,
  outer: string,
  inner: string,
  inc: number
): void {
  if (!out[outer]) out[outer] = {};
  out[outer][inner] = (out[outer][inner] ?? 0) + inc;
}

function bumpMap(out: Record<string, number>, key: string, inc: number): void {
  out[key] = (out[key] ?? 0) + inc;
}

export interface MergePlayerDiagnosticsReport {
  schemaVersion: typeof MERGE_PLAYER_DIAGNOSTICS_SCHEMA_VERSION;
  generatedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  /** Documents which pipeline produced `normalizedPlayerKey` (for audit). */
  normalizationPipeline: "normalizePickPlayerKeyForDiagnostics";
  totals: {
    noCandidateDropCount: number;
    distinctNormalizedPlayers: number;
  };
  /** Counts of internal `no_candidate` drops per normalized pick player key. */
  noCandidateByNormalizedPlayer: Record<string, number>;
  /** Per normalized player → stat (raw `drop.stat` string). */
  noCandidateByPlayerAndStat: Record<string, Record<string, number>>;
  /** Per normalized player → site. */
  noCandidateByPlayerAndSite: Record<string, Record<string, number>>;
  /** Per normalized player → sport. */
  noCandidateByPlayerAndSport: Record<string, Record<string, number>>;
  /**
   * Top keys by count (tie-break: lexicographic `normalizedPlayerKey`).
   * Capped list for machine + human scan.
   */
  topNoCandidatePlayers: Array<{ normalizedPlayerKey: string; count: number }>;
  concentration: {
    top1ShareOfNoCandidate: number | null;
    interpretation: "high_top_key_concentration" | "distributed" | "insufficient_data";
  };
}

function isNoCandidateDrop(d: MergeDropRecord): boolean {
  return d.internalReason === "no_candidate";
}

export function buildMergePlayerDiagnosticsReport(input: {
  generatedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  drops: MergeDropRecord[];
  /** Same pick-side normalization as merge matching (injected by `merge_odds` finalize). */
  normalizePickPlayerKey: (player: string) => string;
}): MergePlayerDiagnosticsReport {
  const noCandidateDrops = input.drops.filter(isNoCandidateDrop);
  const noCandidateByNormalizedPlayer: Record<string, number> = {};
  const noCandidateByPlayerAndStat: Record<string, Record<string, number>> = {};
  const noCandidateByPlayerAndSite: Record<string, Record<string, number>> = {};
  const noCandidateByPlayerAndSport: Record<string, Record<string, number>> = {};

  for (const d of noCandidateDrops) {
    const pk = input.normalizePickPlayerKey(d.player);
    bumpMap(noCandidateByNormalizedPlayer, pk, 1);
    bumpNested(noCandidateByPlayerAndStat, pk, String(d.stat), 1);
    bumpNested(noCandidateByPlayerAndSite, pk, String(d.site), 1);
    bumpNested(noCandidateByPlayerAndSport, pk, String(d.sport), 1);
  }

  const total = noCandidateDrops.length;
  const keys = Object.keys(noCandidateByNormalizedPlayer);
  const topNoCandidatePlayers = keys
    .map((normalizedPlayerKey) => ({
      normalizedPlayerKey,
      count: noCandidateByNormalizedPlayer[normalizedPlayerKey]!,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.normalizedPlayerKey.localeCompare(b.normalizedPlayerKey);
    })
    .slice(0, 50);

  let top1ShareOfNoCandidate: number | null = null;
  let interpretation: MergePlayerDiagnosticsReport["concentration"]["interpretation"] = "insufficient_data";
  if (total === 0) {
    interpretation = "insufficient_data";
  } else {
    const maxCount = Math.max(...Object.values(noCandidateByNormalizedPlayer));
    top1ShareOfNoCandidate = maxCount / total;
    interpretation = top1ShareOfNoCandidate >= 0.5 ? "high_top_key_concentration" : "distributed";
  }

  return {
    schemaVersion: MERGE_PLAYER_DIAGNOSTICS_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    sourceAuditGeneratedAtUtc: input.sourceAuditGeneratedAtUtc,
    normalizationPipeline: "normalizePickPlayerKeyForDiagnostics",
    totals: {
      noCandidateDropCount: total,
      distinctNormalizedPlayers: keys.length,
    },
    noCandidateByNormalizedPlayer,
    noCandidateByPlayerAndStat,
    noCandidateByPlayerAndSite,
    noCandidateByPlayerAndSport,
    topNoCandidatePlayers,
    concentration: {
      top1ShareOfNoCandidate,
      interpretation,
    },
  };
}

export function formatMergePlayerDiagnosticsMarkdown(d: MergePlayerDiagnosticsReport): string {
  const lines: string[] = [];
  lines.push("# Merge player diagnostics (`no_candidate` only)");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${d.generatedAtUtc}`);
  lines.push(`- **Source audit (UTC):** ${d.sourceAuditGeneratedAtUtc}`);
  lines.push(`- **Schema:** merge_player_diagnostics v${d.schemaVersion}`);
  lines.push(`- **Normalization:** \`${d.normalizationPipeline}\` (pick-side; same as merge matching)`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- **no_candidate drops:** ${d.totals.noCandidateDropCount}`);
  lines.push(`- **distinct normalized player keys:** ${d.totals.distinctNormalizedPlayers}`);
  lines.push(
    `- **Concentration:** top-1 share=${d.concentration.top1ShareOfNoCandidate ?? "n/a"} → **${d.concentration.interpretation}**`
  );
  lines.push("");
  lines.push("## Interpretation (non-exhaustive)");
  lines.push("");
  lines.push(
    "- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player."
  );
  lines.push(
    "- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug."
  );
  lines.push(
    "- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes."
  );
  lines.push("");
  lines.push("## Top normalized player keys (up to 50)");
  lines.push("");
  if (d.topNoCandidatePlayers.length === 0) {
    lines.push("- (none)");
  } else {
    for (const row of d.topNoCandidatePlayers) {
      lines.push(`- **${row.normalizedPlayerKey}**: ${row.count}`);
    }
  }
  lines.push("");
  lines.push("## Sample: player × stat (first 15 keys alphabetically)");
  lines.push("");
  const pkeys = Object.keys(d.noCandidateByPlayerAndStat).sort((a, b) => a.localeCompare(b));
  let shown = 0;
  for (const pk of pkeys) {
    lines.push(`- **${pk}**`);
    const inner = d.noCandidateByPlayerAndStat[pk]!;
    for (const st of Object.keys(inner).sort((a, b) => a.localeCompare(b))) {
      lines.push(`  - stat ${st}: ${inner[st]}`);
    }
    shown++;
    if (shown >= 15) {
      if (pkeys.length > 15) lines.push(`- … (${pkeys.length - 15} more player keys omitted)`);
      break;
    }
  }
  if (pkeys.length === 0) lines.push("- (none)");
  lines.push("");
  return lines.join("\n");
}

export function writeMergePlayerDiagnosticsArtifacts(cwd: string, report: MergePlayerDiagnosticsReport): void {
  const { dir, jsonPath, mdPath } = getMergePlayerDiagnosticsPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatMergePlayerDiagnosticsMarkdown(report), "utf8");
}
