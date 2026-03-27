import type { ContextFeatureRecord } from "./context_feature_contract";
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";

export interface MarketContextFeatureInput {
  subjectId: string;
  asOfUtc: string;
  historical: HistoricalFeatureRow | null | undefined;
  provenanceFallback?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Phase 125 — map grounded HistoricalFeatureRow market fields into ContextFeatureRecord.
 * Reporting/validation path only; no optimizer-gating or EV wiring.
 */
export function buildMarketContextRecordsFromHistoricalRow(
  input: MarketContextFeatureInput
): ContextFeatureRecord[] {
  const h = input.historical ?? null;
  if (!h) return [];

  const provenance = h.provenance.market_context ?? input.provenanceFallback ?? "historical_feature_extract";
  const out: ContextFeatureRecord[] = [];

  if (isFiniteNumber(h.openImpliedProb)) {
    out.push({
      key: "market_open_implied_prob",
      family: "market_context",
      kind: "ratio",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: clamp01(h.openImpliedProb),
      provenance,
    });
  }
  if (isFiniteNumber(h.closeImpliedProb)) {
    out.push({
      key: "market_close_implied_prob",
      family: "market_context",
      kind: "ratio",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: clamp01(h.closeImpliedProb),
      provenance,
    });
  }
  if (isFiniteNumber(h.impliedProbDeltaCloseMinusOpen)) {
    out.push({
      key: "market_implied_prob_delta_close_minus_open",
      family: "market_context",
      kind: "zscore",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.impliedProbDeltaCloseMinusOpen,
      provenance,
    });
  }
  if (isFiniteNumber(h.clvDelta)) {
    out.push({
      key: "market_clv_delta",
      family: "market_context",
      kind: "zscore",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.clvDelta,
      provenance,
    });
  }
  if (isFiniteNumber(h.clvPct)) {
    out.push({
      key: "market_clv_pct",
      family: "market_context",
      kind: "zscore",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.clvPct,
      provenance,
    });
  }
  if (typeof h.oddsBucket === "string" && h.oddsBucket.trim()) {
    out.push({
      key: "market_odds_bucket",
      family: "market_context",
      kind: "categorical",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.oddsBucket.trim(),
      provenance,
    });
  }

  return out;
}
