import type { ContextFeatureRecord } from "./context_feature_contract";
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";

export interface MinutesAvailabilityGroundedInput {
  subjectId: string;
  asOfUtc: string;
  historical: HistoricalFeatureRow | null | undefined;
  provenanceFallback?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isMinutesStat(statNormalized: string | null | undefined): boolean {
  const s = String(statNormalized ?? "").trim().toLowerCase();
  return s === "minutes" || s === "min";
}

/**
 * Phase 128 — bridge grounded HistoricalFeatureRow minutes-like fields into
 * minutes_availability context records on validation/export path only.
 */
export function buildMinutesAvailabilityRecordsFromHistoricalRow(
  input: MinutesAvailabilityGroundedInput
): ContextFeatureRecord[] {
  const h = input.historical ?? null;
  if (!h) return [];
  if (!isMinutesStat(h.statNormalized)) return [];

  const provenance = h.provenance.recent_form ?? input.provenanceFallback ?? "historical_feature_extract";
  const out: ContextFeatureRecord[] = [];

  if (isFiniteNumber(h.formL5ScrapeStatMean) && h.formL5ScrapeStatMean >= 0) {
    out.push({
      key: "minutes_l5_avg",
      family: "minutes_availability",
      kind: "unknown",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.formL5ScrapeStatMean,
      provenance,
    });
  }

  if (isFiniteNumber(h.formL10ScrapeStatMean) && h.formL10ScrapeStatMean >= 0) {
    out.push({
      key: "minutes_l10_avg",
      family: "minutes_availability",
      kind: "unknown",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.formL10ScrapeStatMean,
      provenance,
    });
  }

  if (
    isFiniteNumber(h.formL5ScrapeStatMean) &&
    h.formL5ScrapeStatMean >= 0 &&
    isFiniteNumber(h.formL10ScrapeStatMean) &&
    h.formL10ScrapeStatMean >= 0
  ) {
    out.push({
      key: "minutes_trend_delta",
      family: "minutes_availability",
      kind: "unknown",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.formL5ScrapeStatMean - h.formL10ScrapeStatMean,
      provenance,
    });
  }

  if (isFiniteNumber(h.formPriorSampleSize) && h.formPriorSampleSize >= 0) {
    out.push({
      key: "games_played_l10",
      family: "minutes_availability",
      kind: "count",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: Math.round(h.formPriorSampleSize),
      provenance,
    });
  }

  return out;
}
