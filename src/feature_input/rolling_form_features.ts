/**
 * Phase 88 — Recent-form rolling features (binary outcomes only).
 * Semantics align with `historical_feature_extract` last-N hit rates; no perf_tracker I/O here.
 */
import type { ContextFeatureRecord } from './context_feature_contract'
import { normalizeContextFeatureValue } from './normalize_context_feature_value'

const PROVENANCE = 'feature_input/rolling_form_features'

export interface RollingFormBinaryInput {
  subjectId: string
  asOfUtc: string
  /** Resolved prior outcomes 0/1, oldest → newest (same convention as registry extract). */
  priorBinaryOutcomesOldestFirst: readonly number[]
}

function lastN<T>(arr: readonly T[], n: number): T[] {
  if (arr.length <= n) return [...arr]
  return arr.slice(arr.length - n)
}

function arithmeticMean(xs: number[]): number {
  if (xs.length === 0) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function takeStrictBinary(xs: readonly number[]): number[] {
  const out: number[] = []
  for (const x of xs) {
    if (x === 0 || x === 1) out.push(x)
  }
  return out
}

/**
 * Builds `rolling_form_l5_hit_rate` and `rolling_form_l10_hit_rate` when the respective windows are non-empty.
 * Values are ratio-normalized and clamped to [0, 1].
 */
export function buildRollingFormBinaryFeatures(input: RollingFormBinaryInput): ContextFeatureRecord[] {
  const hits = takeStrictBinary(input.priorBinaryOutcomesOldestFirst)
  const h5 = lastN(hits, 5)
  const h10 = lastN(hits, 10)
  const out: ContextFeatureRecord[] = []

  if (h5.length > 0) {
    const raw = arithmeticMean(h5)
    const v = normalizeContextFeatureValue(raw, 'ratio', { clamp: [0, 1] })
    out.push({
      key: 'rolling_form_l5_hit_rate',
      family: 'rolling_form',
      kind: 'ratio',
      asOfUtc: input.asOfUtc,
      subjectId: input.subjectId,
      value: v,
      provenance: PROVENANCE,
    })
  }

  if (h10.length > 0) {
    const raw = arithmeticMean(h10)
    const v = normalizeContextFeatureValue(raw, 'ratio', { clamp: [0, 1] })
    out.push({
      key: 'rolling_form_l10_hit_rate',
      family: 'rolling_form',
      kind: 'ratio',
      asOfUtc: input.asOfUtc,
      subjectId: input.subjectId,
      value: v,
      provenance: PROVENANCE,
    })
  }

  return out
}
