/**
 * Phase 93 — Serializable feature snapshot for debug / validation (no scoring).
 */
import type { ContextFeatureRecord } from './context_feature_contract'
import { joinContextFeaturesForSubject, type JoinedContextFeatures } from './feature_join'

export interface FeatureSnapshot {
  subjectId: string
  asOfUtc: string
  /** Same nested maps as **`joinContextFeaturesForSubject`**, keyed **`featureFamilies`** for snapshot clarity. */
  featureFamilies: JoinedContextFeatures['features']
}

/**
 * Builds a JSON-serializable snapshot: **`joinContextFeaturesForSubject`** then **`featureFamilies`** rename only.
 */
export function buildFeatureSnapshot(input: {
  subjectId: string
  asOfUtc: string
  records: readonly ContextFeatureRecord[]
}): FeatureSnapshot {
  const j = joinContextFeaturesForSubject(input)
  return {
    subjectId: j.subjectId,
    asOfUtc: j.asOfUtc,
    featureFamilies: j.features,
  }
}
