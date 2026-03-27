import type { ContextFeatureRecord } from "./context_feature_contract";
import type { HistoricalFeatureRow } from "../modeling/historical_feature_registry";
import { buildGameEnvironmentFeatures } from "./game_environment_features";

export interface GameEnvironmentGroundedInput {
  subjectId: string;
  asOfUtc: string;
  historical: HistoricalFeatureRow | null | undefined;
  provenanceFallback?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Phase 129 — minimal grounded bridge for game-environment context on
 * validation/export path, using existing HistoricalFeatureRow fields only.
 */
export function buildGameEnvironmentRecordsFromHistoricalRow(
  input: GameEnvironmentGroundedInput
): ContextFeatureRecord[] {
  const h = input.historical ?? null;
  if (!h) return [];

  const provenance = h.provenance.schedule ?? input.provenanceFallback ?? "historical_feature_extract";
  const out: ContextFeatureRecord[] = [];

  if (isFiniteNumber(h.daysRest) && h.daysRest >= 0) {
    out.push({
      key: "env_days_rest",
      family: "game_environment",
      kind: "count",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: Math.round(h.daysRest),
      provenance,
    });
  }

  if (typeof h.isBackToBack === "boolean") {
    out.push({
      key: "env_back_to_back_flag",
      family: "game_environment",
      kind: "ratio",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: h.isBackToBack ? 1 : 0,
      provenance,
    });
  }

  if (isFiniteNumber(h.playerGamesInLast4CalendarDays) && h.playerGamesInLast4CalendarDays >= 0) {
    out.push({
      key: "env_schedule_density_last4d",
      family: "game_environment",
      kind: "count",
      subjectId: input.subjectId,
      asOfUtc: input.asOfUtc,
      value: Math.round(h.playerGamesInLast4CalendarDays),
      provenance,
    });
  }

  // Phase 130: map direct grounded totals/spread only when present.
  const totalsSpread = buildGameEnvironmentFeatures({
    subjectId: input.subjectId,
    asOfUtc: input.asOfUtc,
    gameTotal: isFiniteNumber(h.gameTotal) ? h.gameTotal : null,
    spread: isFiniteNumber(h.spread) ? h.spread : null,
  }).map((r) => ({ ...r, provenance }));
  out.push(...totalsSpread);

  return out;
}
