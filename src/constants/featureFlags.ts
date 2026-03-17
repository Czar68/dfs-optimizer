/**
 * Type-safe feature flags driven by environment variables.
 * Always use isFeatureEnabled(flag) instead of reading process.env directly.
 */

/** All supported flags; adding a key here is the single source of truth. */
export const FEATURE_FLAGS = {
  /** Enable innovative parlay / card builder (env: ENABLE_INNOVATIVE_PARLAY=true). */
  ENABLE_INNOVATIVE_PARLAY: "ENABLE_INNOVATIVE_PARLAY",
  /** Enable experimental parlay logic (env: ENABLE_EXPERIMENTAL_PARLAY=true). */
  ENABLE_EXPERIMENTAL_PARLAY: "ENABLE_EXPERIMENTAL_PARLAY",
  /** Fetch ESPN injury/status and apply compositeScore penalties + block Out/Suspended/IR (env: ESPN_ENRICHMENT_ENABLED=true). Default false. */
  ESPN_ENRICHMENT_ENABLED: "ESPN_ENRICHMENT_ENABLED",
  /** Use line movement (prior snapshot) to adjust compositeScore and optionally block STRONG_AGAINST legs (env: LINE_MOVEMENT_ENABLED=true). Default false. */
  LINE_MOVEMENT_ENABLED: "LINE_MOVEMENT_ENABLED",
  /** When LINE_MOVEMENT_ENABLED, hard-block legs where line moved ≥ 2.0 against our pick (env: LINE_MOVEMENT_BLOCK_ENABLED=true). Default false. */
  LINE_MOVEMENT_BLOCK_ENABLED: "LINE_MOVEMENT_BLOCK_ENABLED",
  /** Enrich legs with recent player form (last-5 avg vs line) before EV scoring (env: ENABLE_ESPN_ENRICHMENT=true). Default false. */
  ENABLE_ESPN_ENRICHMENT: "ENABLE_ESPN_ENRICHMENT",
  /** Wire calculateFantasyScore into adjEv instead of diagnostic-only (env: ENABLE_FANTASY_EV=true). Default false. */
  ENABLE_FANTASY_EV: "ENABLE_FANTASY_EV",
  /** Use adjEv (calibrated) instead of legEv for card selection gating (env: ENABLE_CALIBRATION_ADJEV=true). Default false. */
  ENABLE_CALIBRATION_ADJEV: "ENABLE_CALIBRATION_ADJEV",
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/** Env key → parsed boolean (default false). */
const flagToEnvKey: Record<FeatureFlag, string> = {
  ENABLE_INNOVATIVE_PARLAY: "ENABLE_INNOVATIVE_PARLAY",
  ENABLE_EXPERIMENTAL_PARLAY: "ENABLE_EXPERIMENTAL_PARLAY",
  ESPN_ENRICHMENT_ENABLED: "ESPN_ENRICHMENT_ENABLED",
  LINE_MOVEMENT_ENABLED: "LINE_MOVEMENT_ENABLED",
  LINE_MOVEMENT_BLOCK_ENABLED: "LINE_MOVEMENT_BLOCK_ENABLED",
  ENABLE_ESPN_ENRICHMENT: "ENABLE_ESPN_ENRICHMENT",
  ENABLE_FANTASY_EV: "ENABLE_FANTASY_EV",
  ENABLE_CALIBRATION_ADJEV: "ENABLE_CALIBRATION_ADJEV",
};

/**
 * Returns whether the given feature flag is enabled.
 * Uses process.env[flag] and treats "true", "1", "yes" (case-insensitive) as true; default false.
 * Accessing an undefined flag is a compile-time error via FeatureFlag type.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const key = flagToEnvKey[flag];
  const raw = process.env[key];
  if (raw == null || raw === "") return false;
  const lower = String(raw).trim().toLowerCase();
  return lower === "true" || lower === "1" || lower === "yes";
}

/** Lazy-evaluated flags (called at runtime, not module load) so tests can override env. */
export const FLAGS = {
  get espnEnrichment() {
    return isFeatureEnabled("ENABLE_ESPN_ENRICHMENT");
  },
  get fantasyEv() {
    return isFeatureEnabled("ENABLE_FANTASY_EV");
  },
  get calibrationAdjEv() {
    return isFeatureEnabled("ENABLE_CALIBRATION_ADJEV");
  },
  get innovativeParlay() {
    return isFeatureEnabled("ENABLE_INNOVATIVE_PARLAY");
  },
  get experimentalParlay() {
    return isFeatureEnabled("ENABLE_EXPERIMENTAL_PARLAY");
  },
};
