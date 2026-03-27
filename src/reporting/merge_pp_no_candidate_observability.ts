/**
 * Phase 58 — PrizePicks `no_candidate` observability (reporting only; no merge matcher changes).
 * Survives `--platform both` by writing only when the current merge pass includes PP drops.
 */

import fs from "fs";
import path from "path";
import type { MergeDropRecord } from "../merge_contract";
import {
  PP_COMBO_LABEL_SUBSTRING,
  isPrizePicksComboPlayerLabel,
} from "../merge_contract";
import { stableStringifyForObservability } from "./final_selection_observability";

export const MERGE_PP_NO_CANDIDATE_OBSERVABILITY_SCHEMA_VERSION = 1 as const;

/** @deprecated Use `isPrizePicksComboPlayerLabel` from `merge_contract` — alias for tests / Phase 58. */
export const isPrizepicksComboPlayerLabel = isPrizePicksComboPlayerLabel;

export { PP_COMBO_LABEL_SUBSTRING };

const JSON_NAME = "latest_merge_pp_no_candidate_observability.json";
const MD_NAME = "latest_merge_pp_no_candidate_observability.md";

export function getMergePpNoCandidateObservabilityPaths(cwd: string): { dir: string; jsonPath: string; mdPath: string } {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

function bumpMap(out: Record<string, number>, key: string, inc: number): void {
  out[key] = (out[key] ?? 0) + inc;
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

export interface PpNoCandidateObservabilityReport {
  schemaVersion: typeof MERGE_PP_NO_CANDIDATE_OBSERVABILITY_SCHEMA_VERSION;
  generatedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  site: "prizepicks";
  normalizationPipeline: "normalizePickPlayerKeyForDiagnostics";
  totals: {
    ppNoCandidateDropCount: number;
    singlePlayerLabelCount: number;
    comboLabelCount: number;
    /** combo / ppNoCandidate; null if ppNoCandidate === 0 */
    comboShareOfPpNoCandidate: number | null;
  };
  singlePlayer: {
    distinctNormalizedPlayerKeys: number;
    noCandidateByNormalizedPlayer: Record<string, number>;
    noCandidateByPlayerAndStat: Record<string, Record<string, number>>;
    noCandidateBySport: Record<string, number>;
    topSinglePlayerKeys: Array<{ normalizedPlayerKey: string; count: number }>;
    concentration: {
      top1ShareOfSinglePlayerNoCandidate: number | null;
      interpretation: "high_top_key_concentration" | "distributed" | "insufficient_data";
    };
  };
  combo: {
    totalDrops: number;
    noCandidateByStat: Record<string, number>;
  };
}

function isPpNoCandidate(d: MergeDropRecord): boolean {
  return d.site === "prizepicks" && d.internalReason === "no_candidate";
}

export function buildPpNoCandidateObservabilityReport(input: {
  generatedAtUtc: string;
  sourceAuditGeneratedAtUtc: string;
  drops: MergeDropRecord[];
  normalizePickPlayerKey: (player: string) => string;
}): PpNoCandidateObservabilityReport {
  const ppNoCandidate = input.drops.filter(isPpNoCandidate);
  const singleDrops = ppNoCandidate.filter((d) => !isPrizePicksComboPlayerLabel(d.player));
  const comboDrops = ppNoCandidate.filter((d) => isPrizePicksComboPlayerLabel(d.player));

  const noCandidateByNormalizedPlayer: Record<string, number> = {};
  const noCandidateByPlayerAndStat: Record<string, Record<string, number>> = {};
  const noCandidateBySport: Record<string, number> = {};
  const comboNoCandidateByStat: Record<string, number> = {};

  for (const d of singleDrops) {
    const pk = input.normalizePickPlayerKey(d.player);
    bumpMap(noCandidateByNormalizedPlayer, pk, 1);
    bumpNested(noCandidateByPlayerAndStat, pk, String(d.stat), 1);
    bumpMap(noCandidateBySport, String(d.sport), 1);
  }

  for (const d of comboDrops) {
    bumpMap(comboNoCandidateByStat, String(d.stat), 1);
  }

  const total = ppNoCandidate.length;
  const comboShare = total === 0 ? null : comboDrops.length / total;

  const keys = Object.keys(noCandidateByNormalizedPlayer);
  const topSinglePlayerKeys = keys
    .map((normalizedPlayerKey) => ({
      normalizedPlayerKey,
      count: noCandidateByNormalizedPlayer[normalizedPlayerKey]!,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.normalizedPlayerKey.localeCompare(b.normalizedPlayerKey);
    })
    .slice(0, 50);

  const singleTotal = singleDrops.length;
  let top1ShareOfSinglePlayerNoCandidate: number | null = null;
  let interpretation: PpNoCandidateObservabilityReport["singlePlayer"]["concentration"]["interpretation"] =
    "insufficient_data";
  if (singleTotal === 0) {
    interpretation = "insufficient_data";
  } else {
    const maxCount = Math.max(...Object.values(noCandidateByNormalizedPlayer));
    top1ShareOfSinglePlayerNoCandidate = maxCount / singleTotal;
    interpretation = top1ShareOfSinglePlayerNoCandidate >= 0.5 ? "high_top_key_concentration" : "distributed";
  }

  return {
    schemaVersion: MERGE_PP_NO_CANDIDATE_OBSERVABILITY_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    sourceAuditGeneratedAtUtc: input.sourceAuditGeneratedAtUtc,
    site: "prizepicks",
    normalizationPipeline: "normalizePickPlayerKeyForDiagnostics",
    totals: {
      ppNoCandidateDropCount: total,
      singlePlayerLabelCount: singleDrops.length,
      comboLabelCount: comboDrops.length,
      comboShareOfPpNoCandidate: comboShare,
    },
    singlePlayer: {
      distinctNormalizedPlayerKeys: keys.length,
      noCandidateByNormalizedPlayer,
      noCandidateByPlayerAndStat,
      noCandidateBySport,
      topSinglePlayerKeys,
      concentration: {
        top1ShareOfSinglePlayerNoCandidate,
        interpretation,
      },
    },
    combo: {
      totalDrops: comboDrops.length,
      noCandidateByStat: comboNoCandidateByStat,
    },
  };
}

export function formatPpNoCandidateObservabilityMarkdown(r: PpNoCandidateObservabilityReport): string {
  const lines: string[] = [];
  lines.push("# PrizePicks `no_candidate` observability");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${r.generatedAtUtc}`);
  lines.push(`- **Source audit (UTC):** ${r.sourceAuditGeneratedAtUtc}`);
  lines.push(`- **Schema:** merge_pp_no_candidate_observability v${r.schemaVersion}`);
  lines.push(`- **Normalization:** \`${r.normalizationPipeline}\` (single-player keys only)`);
  lines.push("");
  lines.push("## Totals (PP `no_candidate` only)");
  lines.push("");
  lines.push(`- **PP no_candidate drops:** ${r.totals.ppNoCandidateDropCount}`);
  lines.push(`- **Single-player labels:** ${r.totals.singlePlayerLabelCount}`);
  lines.push(`- **Combo / multi-player labels** (contains \`" + "\`): ${r.totals.comboLabelCount}`);
  lines.push(
    `- **Combo share of PP no_candidate:** ${r.totals.comboShareOfPpNoCandidate === null ? "n/a" : (r.totals.comboShareOfPpNoCandidate * 100).toFixed(1) + "%"}`
  );
  lines.push("");
  lines.push("## Single-player concentration");
  lines.push("");
  lines.push(
    `- **top-1 share (single-player only):** ${r.singlePlayer.concentration.top1ShareOfSinglePlayerNoCandidate ?? "n/a"} → **${r.singlePlayer.concentration.interpretation}**`
  );
  lines.push("");
  lines.push("## Top single-player normalized keys (up to 50)");
  lines.push("");
  if (r.singlePlayer.topSinglePlayerKeys.length === 0) {
    lines.push("- (none)");
  } else {
    for (const row of r.singlePlayer.topSinglePlayerKeys) {
      lines.push(`- **${row.normalizedPlayerKey}**: ${row.count}`);
    }
  }
  lines.push("");
  lines.push("## PP `no_candidate` by sport (single-player labels)");
  lines.push("");
  for (const sp of Object.keys(r.singlePlayer.noCandidateBySport).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- **${sp}:** ${r.singlePlayer.noCandidateBySport[sp]}`);
  }
  if (Object.keys(r.singlePlayer.noCandidateBySport).length === 0) lines.push("- (none)");
  lines.push("");
  lines.push("## Combo labels — by stat");
  lines.push("");
  for (const st of Object.keys(r.combo.noCandidateByStat).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- **${st}:** ${r.combo.noCandidateByStat[st]}`);
  }
  if (Object.keys(r.combo.noCandidateByStat).length === 0) lines.push("- (none)");
  lines.push("");
  return lines.join("\n");
}

export function writePpNoCandidateObservabilityArtifacts(cwd: string, report: PpNoCandidateObservabilityReport): void {
  const { dir, jsonPath, mdPath } = getMergePpNoCandidateObservabilityPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatPpNoCandidateObservabilityMarkdown(report), "utf8");
}
