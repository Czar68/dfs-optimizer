import type { ContextFeatureRecord } from "./context_feature_contract";
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";

export interface RoleStabilityFeatureInput {
  subjectId: string;
  asOfUtc: string;
  historical: HistoricalFeatureRow | null | undefined;
  provenanceFallback?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Phase 127 — minimal role-stability mapper from grounded HistoricalFeatureRow fields.
 * Validation/export path only.
 */
export function buildRoleStabilityRecordsFromHistoricalRow(
  input: RoleStabilityFeatureInput
): ContextFeatureRecord[] {
  const h = input.historical ?? null;
  if (!h) return [];
  const provenance = h.provenance.role_stability ?? input.provenanceFallback ?? "historical_feature_extract";
  const out: ContextFeatureRecord[] = [];

  if (isFiniteNumber(h.roleMinutesTrend)) {
    out.push({
      key: "role_minutes_trend",
      family: "other",
      kind: "zscore",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.roleMinutesTrend,
      provenance,
    });
  }

  if (typeof h.roleStabilityNote === "string" && h.roleStabilityNote.trim()) {
    out.push({
      key: "role_stability_note",
      family: "other",
      kind: "categorical",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.roleStabilityNote.trim(),
      provenance,
    });
  }

  return out;
}
