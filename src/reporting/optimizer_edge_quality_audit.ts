/**
 * Phase 117 — Optimizer edge quality audit (read-only reporting; no EV/breakeven math changes).
 */

import fs from "fs";
import path from "path";
import type { CardEvResult } from "../types";
import { stableStringifyForObservability } from "./final_selection_observability";
import type { PortfolioDiversificationFilePayload } from "./portfolio_diversification_artifacts";

export const OPTIMIZER_EDGE_QUALITY_AUDIT_SCHEMA_VERSION = 1 as const;

/** Same scale as Telegram high-EV digest (`run_optimizer`); not a selection gate. */
export const DEFAULT_HIGH_EV_BAR_FOR_EDGE_AUDIT = 0.07;

const REPORTS = "data/reports";
const JSON_NAME = "latest_optimizer_edge_quality.json";
const MD_NAME = "latest_optimizer_edge_quality.md";

/** Compact echo for `latest_run_status.json` (Phase 117). */
export interface OptimizerEdgeQualityRunStatusSummary {
  status: string;
  degradedOutput: boolean;
  summaryLine: string;
  artifactRel: string;
}

export function optimizerEdgeQualitySummaryForRunStatus(audit: OptimizerEdgeQualityAudit): OptimizerEdgeQualityRunStatusSummary {
  return {
    status: audit.outputQuality.status,
    degradedOutput: audit.outputQuality.degradedOutput,
    summaryLine: audit.outputQuality.summaryLine,
    artifactRel: `${REPORTS}/${JSON_NAME}`.replace(/\\/g, "/"),
  };
}

/**
 * Builds + writes `data/reports/latest_optimizer_edge_quality.*`; returns summary for run status.
 * On failure logs and returns null (non-fatal).
 */
export function tryWriteOptimizerEdgeQualityAuditFromRunParts(
  rootDir: string,
  input: {
    ppExportCards: CardEvResult[];
    udExportCards: CardEvResult[];
    ppCandidatePoolCount: number | null;
    udCandidatePoolCount: number | null;
    cardEvFloor: number;
    highEvBar?: number;
  }
): OptimizerEdgeQualityRunStatusSummary | null {
  try {
    const audit = buildOptimizerEdgeQualityAudit({
      generatedAtUtc: new Date().toISOString(),
      ppExportCards: input.ppExportCards,
      udExportCards: input.udExportCards,
      ppCandidatePoolCount: input.ppCandidatePoolCount,
      udCandidatePoolCount: input.udCandidatePoolCount,
      cardEvFloor: input.cardEvFloor,
      highEvBar: input.highEvBar ?? DEFAULT_HIGH_EV_BAR_FOR_EDGE_AUDIT,
      rootDir,
    });
    writeOptimizerEdgeQualityAuditArtifacts(rootDir, audit);
    console.log(`[Phase117] ${audit.outputQuality.summaryLine}`);
    return optimizerEdgeQualitySummaryForRunStatus(audit);
  } catch (e) {
    console.warn("[Phase117] Failed optimizer edge quality audit:", (e as Error).message);
    return null;
  }
}

export interface PlatformEdgeSlice {
  platform: "prizepicks" | "underdog";
  exportedCardCount: number;
  /** Pre-cap ranked candidates (PP: `sortedCards.length` when provided). */
  candidatePoolCount: number | null;
  topCardEvs: number[];
  /** top1 / sum(top5) when ≥3 exported; null if degenerate. */
  top1ShareOfTop5EvSum: number | null;
  /** cardEv[0] − cardEv[4] when ≥5 cards. */
  evDropTop1ToRank5: number | null;
  /** Share of exported cards with cardEv ≥ threshold. */
  shareAtOrAboveCardEvThreshold: number | null;
  countAtOrAboveCardEvThreshold: number;
  /** Count with cardEv > highEvBar (same order of magnitude as Telegram digest). */
  exportedAboveHighEvBar: number;
  uniquePlayersInTop5Cards: number;
  legSlotsInTop5Cards: number;
  maxLegKeyRepeatAcrossTop5: number;
  topRepeatedLegKeys: Array<{ legKey: string; count: number }>;
  /** Most common stat among legs in top-5 cards (by leg count). */
  dominantStatTopSlice: string | null;
  diversificationFromArtifact: {
    maxPairwiseOverlapDiversified: number | null;
    greedyStoppedEarly: boolean | null;
    candidateCount: number | null;
  } | null;
}

export interface OptimizerEdgeQualityAudit {
  schemaVersion: typeof OPTIMIZER_EDGE_QUALITY_AUDIT_SCHEMA_VERSION;
  generatedAtUtc: string;
  thresholds: {
    cardEvFloor: number;
    highEvBar: number;
    note: string;
  };
  pp: PlatformEdgeSlice | null;
  ud: PlatformEdgeSlice | null;
  explainability: {
    lines: string[];
    fragilityFlags: string[];
  };
  outputQuality: {
    status: "empty" | "thin" | "moderate" | "strong";
    degradedOutput: boolean;
    summaryLine: string;
  };
}

function legKeyForPick(card: CardEvResult, legIdx: number): string {
  const L = card.legs[legIdx];
  if (!L) return "";
  const p = L.pick;
  if (p.legKey && p.legKey.length > 0) return p.legKey;
  return `${p.site}:${p.player}:${p.stat}:${p.line}:${L.side}`;
}

function buildSlice(
  platform: PlatformEdgeSlice["platform"],
  exported: CardEvResult[],
  candidatePoolCount: number | null,
  thresholds: { cardEvFloor: number; highEvBar: number },
  divHint: PlatformEdgeSlice["diversificationFromArtifact"]
): PlatformEdgeSlice | null {
  if (exported.length === 0 && (candidatePoolCount === null || candidatePoolCount === 0)) {
    return null;
  }
  const sorted = [...exported].sort((a, b) => b.cardEv - a.cardEv);
  if (sorted.length === 0) {
    return {
      platform,
      exportedCardCount: 0,
      candidatePoolCount,
      topCardEvs: [],
      top1ShareOfTop5EvSum: null,
      evDropTop1ToRank5: null,
      shareAtOrAboveCardEvThreshold: null,
      countAtOrAboveCardEvThreshold: 0,
      exportedAboveHighEvBar: 0,
      uniquePlayersInTop5Cards: 0,
      legSlotsInTop5Cards: 0,
      maxLegKeyRepeatAcrossTop5: 0,
      topRepeatedLegKeys: [],
      dominantStatTopSlice: null,
      diversificationFromArtifact: divHint,
    };
  }
  const top5 = sorted.slice(0, 5);
  const topEvs = top5.map((c) => c.cardEv);
  const top5sum = topEvs.reduce((s, x) => s + Math.max(0, x), 0);
  const top1Share =
    topEvs.length >= 3 && top5sum > 1e-9 ? topEvs[0]! / top5sum : topEvs.length > 0 ? 1 : null;

  let evDrop: number | null = null;
  if (topEvs.length >= 5) {
    evDrop = topEvs[0]! - topEvs[4]!;
  }

  const atTh = sorted.filter((c) => c.cardEv >= thresholds.cardEvFloor).length;
  const shareAt = sorted.length > 0 ? atTh / sorted.length : null;

  const aboveHigh = sorted.filter((c) => c.cardEv > thresholds.highEvBar).length;

  const legCounts = new Map<string, number>();
  const playerSet = new Set<string>();
  let legSlots = 0;
  const statCounts = new Map<string, number>();
  for (const card of top5) {
    for (let i = 0; i < card.legs.length; i++) {
      const k = legKeyForPick(card, i);
      if (!k) continue;
      legCounts.set(k, (legCounts.get(k) ?? 0) + 1);
      legSlots++;
      const pl = card.legs[i]!.pick.player.trim().toLowerCase();
      playerSet.add(pl);
      const st = String(card.legs[i]!.pick.stat);
      statCounts.set(st, (statCounts.get(st) ?? 0) + 1);
    }
  }
  let maxRep = 0;
  const topLegs = [...legCounts.entries()]
    .map(([legKey, count]) => {
      maxRep = Math.max(maxRep, count);
      return { legKey, count };
    })
    .sort((a, b) => b.count - a.count || a.legKey.localeCompare(b.legKey))
    .slice(0, 8);

  let domStat: string | null = null;
  let domN = 0;
  for (const [st, n] of statCounts) {
    if (n > domN) {
      domN = n;
      domStat = st;
    }
  }

  return {
    platform,
    exportedCardCount: sorted.length,
    candidatePoolCount,
    topCardEvs: topEvs.slice(0, 5),
    top1ShareOfTop5EvSum: top1Share,
    evDropTop1ToRank5: evDrop,
    shareAtOrAboveCardEvThreshold: shareAt,
    countAtOrAboveCardEvThreshold: atTh,
    exportedAboveHighEvBar: aboveHigh,
    uniquePlayersInTop5Cards: playerSet.size,
    legSlotsInTop5Cards: legSlots,
    maxLegKeyRepeatAcrossTop5: maxRep,
    topRepeatedLegKeys: topLegs,
    dominantStatTopSlice: domStat,
    diversificationFromArtifact: divHint,
  };
}

function readDivHints(root: string): {
  pp: PlatformEdgeSlice["diversificationFromArtifact"];
  ud: PlatformEdgeSlice["diversificationFromArtifact"];
} {
  const p = path.join(root, REPORTS, "latest_portfolio_diversification.json");
  const empty = (): PlatformEdgeSlice["diversificationFromArtifact"] => null;
  if (!fs.existsSync(p)) {
    return { pp: empty(), ud: empty() };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as PortfolioDiversificationFilePayload;
    const pp =
      raw.pp?.enabled && raw.pp.report
        ? {
            maxPairwiseOverlapDiversified: raw.pp.report.maxPairwiseOverlapDiversified,
            greedyStoppedEarly: raw.pp.report.greedyStoppedEarly,
            candidateCount: raw.pp.report.candidateCount,
          }
        : null;
    const ud =
      raw.ud?.enabled && raw.ud.report
        ? {
            maxPairwiseOverlapDiversified: raw.ud.report.maxPairwiseOverlapDiversified,
            greedyStoppedEarly: raw.ud.report.greedyStoppedEarly,
            candidateCount: raw.ud.report.candidateCount,
          }
        : null;
    return { pp, ud };
  } catch {
    return { pp: empty(), ud: empty() };
  }
}

function deriveOutputQuality(
  pp: PlatformEdgeSlice | null,
  ud: PlatformEdgeSlice | null,
  flags: string[]
): OptimizerEdgeQualityAudit["outputQuality"] {
  const total = (pp?.exportedCardCount ?? 0) + (ud?.exportedCardCount ?? 0);
  if (total === 0) {
    return {
      status: "empty",
      degradedOutput: true,
      summaryLine: "optimizer_edge_quality: status=empty exported=0",
    };
  }

  const thin = total <= 2 || flags.includes("few_exported_cards");
  const fragile =
    flags.includes("high_top_ev_concentration") ||
    flags.includes("heavy_leg_reuse_top_slice") ||
    flags.includes("very_shallow_export_vs_pool");

  let status: OptimizerEdgeQualityAudit["outputQuality"]["status"] = "moderate";
  if (thin) status = "thin";
  else if (!fragile && total >= 5) status = "strong";

  const degraded = thin || fragile;

  const summaryLine = `optimizer_edge_quality: status=${status} degraded=${degraded ? 1 : 0} total_exported=${total} flags=${flags.length}`;

  return { status, degradedOutput: degraded, summaryLine };
}

function collectFlags(
  pp: PlatformEdgeSlice | null,
  ud: PlatformEdgeSlice | null,
  ppPool: number | null,
  udPool: number | null
): string[] {
  const flags: string[] = [];
  const ppn = pp?.exportedCardCount ?? 0;
  const udn = ud?.exportedCardCount ?? 0;
  if (ppn + udn <= 2 && ppn + udn > 0) {
    flags.push("few_exported_cards");
  }
  for (const s of [pp, ud]) {
    if (!s) continue;
    if (s.top1ShareOfTop5EvSum != null && s.top1ShareOfTop5EvSum > 0.55 && s.exportedCardCount >= 3) {
      flags.push("high_top_ev_concentration");
    }
    if (s.maxLegKeyRepeatAcrossTop5 >= 3) {
      flags.push("heavy_leg_reuse_top_slice");
    }
    const pool = s.platform === "prizepicks" ? ppPool : udPool;
    if (pool != null && pool > 10 && s.exportedCardCount / pool < 0.03) {
      flags.push("very_shallow_export_vs_pool");
    }
  }
  return [...new Set(flags)].sort();
}

function explainLines(
  pp: PlatformEdgeSlice | null,
  ud: PlatformEdgeSlice | null,
  flags: string[]
): string[] {
  const lines: string[] = [];
  if (pp && pp.exportedCardCount > 0) {
    lines.push(
      `PP: ${pp.exportedCardCount} exported` +
        (pp.candidatePoolCount != null ? ` (pool ${pp.candidatePoolCount} pre-cap)` : "") +
        `. Top EV ${pp.topCardEvs[0]?.toFixed(4) ?? "—"}; top-1 share of top-5 sum ${pp.top1ShareOfTop5EvSum?.toFixed(3) ?? "—"}.`
    );
    if (pp.exportedAboveHighEvBar > 0) {
      lines.push(`PP: ${pp.exportedAboveHighEvBar} card(s) above high-EV bar (same scale as digest).`);
    }
  }
  if (ud && ud.exportedCardCount > 0) {
    lines.push(
      `UD: ${ud.exportedCardCount} exported` +
        (ud.candidatePoolCount != null ? ` (pool ${ud.candidatePoolCount} pre-cap)` : "") +
        `. Top EV ${ud.topCardEvs[0]?.toFixed(4) ?? "—"}.`
    );
  }
  if (flags.includes("high_top_ev_concentration")) {
    lines.push("Ranking is top-heavy: a large share of top-5 EV sits in #1 — diversification or pool depth may be weak.");
  }
  if (flags.includes("heavy_leg_reuse_top_slice")) {
    lines.push("Same leg keys repeat across the top exported slice — correlated risk.");
  }
  if (flags.includes("very_shallow_export_vs_pool")) {
    lines.push("Very few exported cards vs large candidate pool — selection pressure or gates removed most candidates.");
  }
  return lines;
}

export function buildOptimizerEdgeQualityAudit(input: {
  generatedAtUtc: string;
  ppExportCards: CardEvResult[];
  udExportCards: CardEvResult[];
  ppCandidatePoolCount: number | null;
  udCandidatePoolCount: number | null;
  cardEvFloor: number;
  highEvBar: number;
  rootDir?: string;
}): OptimizerEdgeQualityAudit {
  const root = input.rootDir ?? process.cwd();
  const hints = readDivHints(root);

  const pp = buildSlice(
    "prizepicks",
    input.ppExportCards,
    input.ppCandidatePoolCount,
    { cardEvFloor: input.cardEvFloor, highEvBar: input.highEvBar },
    hints.pp
  );
  const ud = buildSlice(
    "underdog",
    input.udExportCards,
    input.udCandidatePoolCount,
    { cardEvFloor: input.cardEvFloor, highEvBar: input.highEvBar },
    hints.ud
  );

  const flags = collectFlags(pp, ud, input.ppCandidatePoolCount, input.udCandidatePoolCount);
  const explainability = {
    lines: explainLines(pp, ud, flags),
    fragilityFlags: flags,
  };

  const outputQuality = deriveOutputQuality(pp, ud, flags);

  return {
    schemaVersion: OPTIMIZER_EDGE_QUALITY_AUDIT_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    thresholds: {
      cardEvFloor: input.cardEvFloor,
      highEvBar: input.highEvBar,
      note:
        "cardEvFloor matches export MIN_CARD_EV / CLI; highEvBar aligns with Telegram high-EV digest (not a policy gate).",
    },
    pp,
    ud,
    explainability,
    outputQuality,
  };
}

export function formatOptimizerEdgeQualityMarkdown(a: OptimizerEdgeQualityAudit): string {
  const lines: string[] = [];
  lines.push("# Optimizer edge quality audit");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${a.generatedAtUtc}`);
  lines.push(`- **Output status:** **${a.outputQuality.status}** · degraded=${a.outputQuality.degradedOutput}`);
  lines.push(`- **Summary:** ${a.outputQuality.summaryLine}`);
  lines.push("");
  lines.push("## Thresholds");
  lines.push(`- cardEvFloor=${a.thresholds.cardEvFloor} highEvBar=${a.thresholds.highEvBar}`);
  lines.push(`- ${a.thresholds.note}`);
  lines.push("");
  if (a.explainability.fragilityFlags.length > 0) {
    lines.push("## Fragility flags");
    for (const f of a.explainability.fragilityFlags) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }
  lines.push("## Explainability");
  for (const l of a.explainability.lines) {
    lines.push(`- ${l}`);
  }
  lines.push("");
  for (const label of ["pp", "ud"] as const) {
    const s = label === "pp" ? a.pp : a.ud;
    lines.push(`## ${label.toUpperCase()}`);
    if (!s) {
      lines.push("_No exported cards._");
      lines.push("");
      continue;
    }
    lines.push(`- exported: ${s.exportedCardCount} · pool: ${s.candidatePoolCount ?? "—"}`);
    lines.push(`- top EVs: ${s.topCardEvs.map((x) => x.toFixed(4)).join(", ")}`);
    lines.push(`- top1/top5-sum: ${s.top1ShareOfTop5EvSum?.toFixed(3) ?? "—"} · drop 1→5: ${s.evDropTop1ToRank5?.toFixed(4) ?? "—"}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function writeOptimizerEdgeQualityAuditArtifacts(rootDir: string, audit: OptimizerEdgeQualityAudit): void {
  const dir = path.join(rootDir, REPORTS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const j = path.join(dir, JSON_NAME);
  const m = path.join(dir, MD_NAME);
  fs.writeFileSync(j, stableStringifyForObservability(audit), "utf8");
  fs.writeFileSync(m, `${formatOptimizerEdgeQualityMarkdown(audit)}\n`, "utf8");
}

/** Phase 117 — compact line for run status (optional). */
export function readOptimizerEdgeQualitySummaryForRunStatus(rootDir: string): {
  status: string;
  degradedOutput: boolean;
  summaryLine: string;
  artifactRel: string;
} | null {
  const j = path.join(rootDir, REPORTS, JSON_NAME);
  if (!fs.existsSync(j)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(j, "utf8")) as OptimizerEdgeQualityAudit;
    if (raw.outputQuality?.summaryLine == null) return null;
    return {
      status: raw.outputQuality.status,
      degradedOutput: raw.outputQuality.degradedOutput,
      summaryLine: raw.outputQuality.summaryLine,
      artifactRel: `${REPORTS}/${JSON_NAME}`.replace(/\\/g, "/"),
    };
  } catch {
    return null;
  }
}
