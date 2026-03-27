/**
 * Phase 120 — Map grounded historical rolling-form fields into `ContextFeatureRecord` rows.
 * Source fields come from `HistoricalFeatureRow` (Phase 80 extract), not new upstream APIs.
 */
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";
import type { ContextFeatureRecord } from "./context_feature_contract";
import { normalizeContextFeatureValue } from "./normalize_context_feature_value";

const PROVENANCE_PRIMARY = "historical_feature_extract";

/**
 * Emits conservative rolling-form records when historical fields are present:
 * - `rolling_form_l5_hit_rate` (ratio, [0,1])
 * - `rolling_form_l10_hit_rate` (ratio, [0,1])
 * - `rolling_form_l20_hit_rate` (ratio, [0,1])
 * - `rolling_form_prior_sample_size` (count)
 * - `rolling_form_l10_hit_trend_slope` (zscore-like numeric slope, no clamp)
 *
 * Any null/non-finite source field is skipped.
 */
export function buildRollingFormContextRecordsFromHistoricalRow(input: {
  subjectId: string;
  asOfUtc: string;
  historical: HistoricalFeatureRow | null;
  provenanceFallback?: string;
}): ContextFeatureRecord[] {
  const h = input.historical;
  if (!h) return [];
  const subjectId = input.subjectId;
  const asOfUtc = input.asOfUtc;
  const provenance = input.provenanceFallback ?? PROVENANCE_PRIMARY;
  const out: ContextFeatureRecord[] = [];

  const pushRatio = (key: string, raw: number | null): void => {
    const v = normalizeContextFeatureValue(raw, "ratio", { clamp: [0, 1] });
    if (v == null) return;
    out.push({
      key,
      family: "rolling_form",
      kind: "ratio",
      subjectId,
      asOfUtc,
      value: v,
      provenance,
    });
  };

  pushRatio("rolling_form_l5_hit_rate", h.formL5HitRate);
  pushRatio("rolling_form_l10_hit_rate", h.formL10HitRate);
  pushRatio("rolling_form_l20_hit_rate", h.formL20HitRate);

  {
    const v = normalizeContextFeatureValue(h.formPriorSampleSize, "count");
    if (v != null) {
      out.push({
        key: "rolling_form_prior_sample_size",
        family: "rolling_form",
        kind: "count",
        subjectId,
        asOfUtc,
        value: v,
        provenance,
      });
    }
  }

  {
    const v = normalizeContextFeatureValue(h.formL10HitTrendSlope, "zscore");
    if (v != null) {
      out.push({
        key: "rolling_form_l10_hit_trend_slope",
        family: "rolling_form",
        kind: "zscore",
        subjectId,
        asOfUtc,
        value: v,
        provenance,
      });
    }
  }

  return out;
}
