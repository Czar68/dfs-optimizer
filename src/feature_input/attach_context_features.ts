/**
 * Phase 95 — Attach **`FeatureSnapshot`** + **`FeatureScoreSignals`** to **`CardEvResult`** / **`EvPick`** without changing EV math.
 * Call when **`ContextFeatureRecord`** rows exist; default pipeline leaves fields unset.
 */
import type { CardEvResult, EvPick } from '../types'
import type { ContextFeatureRecord } from './context_feature_contract'
import { buildFeatureSnapshot } from './feature_snapshot'
import { scoreFeatureSnapshot } from './feature_scoring'

export function attachFeatureContextToCard(
  card: CardEvResult,
  input: { subjectId: string; asOfUtc: string; records: readonly ContextFeatureRecord[] }
): CardEvResult {
  const featureSnapshot = buildFeatureSnapshot(input)
  const featureSignals = scoreFeatureSnapshot(featureSnapshot)
  return { ...card, featureSnapshot, featureSignals }
}

export function attachFeatureContextToPick(
  pick: EvPick,
  input: { subjectId: string; asOfUtc: string; records: readonly ContextFeatureRecord[] }
): EvPick {
  const featureSnapshot = buildFeatureSnapshot(input)
  const featureSignals = scoreFeatureSnapshot(featureSnapshot)
  return { ...pick, featureSnapshot, featureSignals }
}
