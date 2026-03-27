/**
 * Phase 72 — Read-only comparison: naive leg metric (trueProb−0.5) vs market-relative edge (trueProb − fair chosen).
 * Uses math_models/juice_adjust.fairProbChosenSide (two-way de-vig) and odds_math.americanToImpliedProb.
 */

import fs from "fs";
import path from "path";
import { americanToImpliedProb } from "../odds_math";
import {
  fairProbChosenSide,
  legacyNaiveLegMetric,
} from "../../math_models/juice_adjust";
import { parseCsv } from "../tracking/legs_csv_index";

export { fairProbChosenSide };
export function naiveLegMetric(trueProb: number): number {
  return legacyNaiveLegMetric(trueProb);
}

export const MARKET_EDGE_ALIGNMENT_SCHEMA_VERSION = 1;

export type ParsedLegRow = {
  id: string;
  trueProb: number;
  overOdds: number;
  underOdds: number;
  legEv: number;
  edge: number;
  side: "over" | "under";
};

export function inferSideFromLegIdCanonical(legId: string): "over" | "under" {
  const s = legId.toLowerCase();
  if (/-under(?:$|-)/.test(s)) return "under";
  if (/-over(?:$|-)/.test(s)) return "over";
  return "over";
}

export function impliedProbChosenSide(overOdds: number, underOdds: number, side: "over" | "under"): number {
  const io = americanToImpliedProb(overOdds);
  const iu = americanToImpliedProb(underOdds);
  return side === "over" ? io : iu;
}

export function marketEdgeFair(trueProb: number, overOdds: number, underOdds: number, side: "over" | "under"): number {
  return trueProb - fairProbChosenSide(overOdds, underOdds, side);
}

export function loadLegCsv(pathStr: string): ParsedLegRow[] {
  if (!fs.existsSync(pathStr)) return [];
  const { headers, rows } = parseCsv(pathStr);
  if (headers.length === 0) return [];
  const idx = (h: string) => headers.indexOf(h);
  const idIdx = idx("id");
  const tpIdx = idx("trueProb");
  const oIdx = idx("overOdds");
  const uIdx = idx("underOdds");
  const levIdx = idx("legEv");
  const edgeIdx = idx("edge");
  if (idIdx < 0 || tpIdx < 0 || oIdx < 0 || uIdx < 0 || levIdx < 0 || edgeIdx < 0) return [];

  const out: ParsedLegRow[] = [];
  for (const row of rows) {
    const id = (row[idIdx] ?? "").trim();
    if (!id) continue;
    const trueProb = parseFloat(row[tpIdx] ?? "");
    const overOdds = parseFloat(row[oIdx] ?? "");
    const underOdds = parseFloat(row[uIdx] ?? "");
    const legEv = parseFloat(row[levIdx] ?? "");
    const edge = parseFloat(row[edgeIdx] ?? "");
    if (!Number.isFinite(trueProb) || !Number.isFinite(overOdds) || !Number.isFinite(underOdds)) continue;
    const side = inferSideFromLegIdCanonical(id);
    out.push({
      id,
      trueProb,
      overOdds,
      underOdds,
      legEv: Number.isFinite(legEv) ? legEv : naiveLegMetric(trueProb),
      edge: Number.isFinite(edge) ? edge : naiveLegMetric(trueProb),
      side,
    });
  }
  return out;
}

export function enrichMetrics(legs: ParsedLegRow[]): Array<
  ParsedLegRow & {
    impliedChosen: number;
    fairChosen: number;
    marketEdgeFair: number;
    marketEdgeVig: number;
    naiveMetric: number;
    deltaNaiveVsMarketFair: number;
  }
> {
  return legs.map((leg) => {
    const impliedChosen = impliedProbChosenSide(leg.overOdds, leg.underOdds, leg.side);
    const fairChosen = fairProbChosenSide(leg.overOdds, leg.underOdds, leg.side);
    const marketEdgeFair = leg.trueProb - fairChosen;
    const marketEdgeVig = leg.trueProb - impliedChosen;
    const naiveMetric = naiveLegMetric(leg.trueProb);
    return {
      ...leg,
      impliedChosen,
      fairChosen,
      marketEdgeFair,
      marketEdgeVig,
      naiveMetric,
      deltaNaiveVsMarketFair: naiveMetric - marketEdgeFair,
    };
  });
}

export function pickTopOverstatements(
  enriched: ReturnType<typeof enrichMetrics>,
  k: number
): Array<{ id: string; legEv: number; marketEdgeFair: number; deltaNaiveVsMarketFair: number; overOdds: number }> {
  return [...enriched]
    .sort((a, b) => b.deltaNaiveVsMarketFair - a.deltaNaiveVsMarketFair)
    .slice(0, k)
    .map((r) => ({
      id: r.id,
      legEv: r.legEv,
      marketEdgeFair: r.marketEdgeFair,
      deltaNaiveVsMarketFair: r.deltaNaiveVsMarketFair,
      overOdds: r.overOdds,
    }));
}

export function filterExtremePrice(
  enriched: ReturnType<typeof enrichMetrics>,
  maxAmericanForFavorite = -300
): ReturnType<typeof enrichMetrics> {
  return enriched.filter((r) => r.side === "over" && r.overOdds <= maxAmericanForFavorite);
}
