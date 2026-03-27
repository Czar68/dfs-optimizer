import type { ContextFeatureRecord } from "./context_feature_contract";
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";

export interface MatchupContextFeatureInput {
  subjectId: string;
  asOfUtc: string;
  historical: HistoricalFeatureRow | null | undefined;
  provenanceFallback?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Phase 126 — minimal matchup-context mapper from grounded HistoricalFeatureRow fields.
 * Validation/export path only.
 */
export function buildMatchupContextRecordsFromHistoricalRow(
  input: MatchupContextFeatureInput
): ContextFeatureRecord[] {
  const h = input.historical ?? null;
  if (!h) return [];
  const provenance = h.provenance.opponent_context ?? input.provenanceFallback ?? "historical_feature_extract";
  const out: ContextFeatureRecord[] = [];

  if (typeof h.opponentAbbrevResolved === "string" && h.opponentAbbrevResolved.trim()) {
    out.push({
      key: "matchup_opponent_abbrev",
      family: "matchup_context",
      kind: "categorical",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.opponentAbbrevResolved.trim(),
      provenance,
    });
  }

  if (isFiniteNumber(h.opponentDefRankForStat)) {
    out.push({
      key: "matchup_opponent_def_rank_for_stat",
      family: "matchup_context",
      kind: "count",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: Math.round(h.opponentDefRankForStat),
      provenance,
    });
  }

  return out;
}
