/**
 * Phase 92 — Deterministic grouping of `ContextFeatureRecord` rows by family for one subject + snapshot time.
 * No scoring, no optimizer imports.
 */
import type { ContextFeatureFamily, ContextFeatureRecord } from './context_feature_contract'

/** Per-family map: feature `key` → normalized `value`. */
export type ContextFeatureValueMap = Record<string, number | string | null>

export interface JoinedContextFeatures {
  subjectId: string
  asOfUtc: string
  /**
   * Only families with at least one matching record.
   * Duplicate `key` in the same family: **last** row in `records` order wins.
   */
  features: Partial<Record<ContextFeatureFamily, ContextFeatureValueMap>>
}

export function joinContextFeaturesForSubject(input: {
  subjectId: string
  asOfUtc: string
  records: readonly ContextFeatureRecord[]
}): JoinedContextFeatures {
  const { subjectId, asOfUtc, records } = input
  const features: Partial<Record<ContextFeatureFamily, ContextFeatureValueMap>> = {}

  for (const r of records) {
    if (r.subjectId !== subjectId || r.asOfUtc !== asOfUtc) continue
    const fam = r.family
    const prev = features[fam] ?? {}
    features[fam] = { ...prev, [r.key]: r.value }
  }

  return { subjectId, asOfUtc, features }
}
