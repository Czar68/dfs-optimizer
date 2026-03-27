/**
 * Phase 89 — Minutes + availability context (pure; callers supply nba_api-style game logs; no I/O here).
 */
import type { ContextFeatureFamily, ContextFeatureRecord, FeatureValueKind } from './context_feature_contract'
import { normalizeContextFeatureValue } from './normalize_context_feature_value'

const FAMILY: ContextFeatureFamily = 'minutes_availability'
const PROVENANCE = 'feature_input/minutes_availability_features'

/** Minimum row: minutes per game; extend later without breaking callers. */
export interface GameLogMinuteRow {
  minutes: number
}

export interface MinutesAvailabilityInput {
  subjectId: string
  asOfUtc: string
  /** Oldest → newest (most recent game last). */
  gameLogRowsChronological: readonly GameLogMinuteRow[]
}

/** Sample std (n ≥ 2); else null. */
function sampleStdDev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function lastN<T>(arr: readonly T[], n: number): T[] {
  if (arr.length <= n) return [...arr]
  return arr.slice(arr.length - n)
}

/** Deterministic buckets from minute std (same units as minutes). */
function consistencyBucket(std: number | null): string | null {
  if (std == null || !Number.isFinite(std)) return null
  if (std < 3) return 'low'
  if (std < 5) return 'medium'
  return 'high'
}

function num(
  raw: number | null,
  kind: FeatureValueKind,
  opts?: { clamp?: readonly [number, number]; decimals?: number }
): number | null {
  if (raw == null || !Number.isFinite(raw)) return null
  const v = normalizeContextFeatureValue(raw, kind, opts ?? {})
  return typeof v === 'number' ? v : null
}

/**
 * Builds minutes + availability **`ContextFeatureRecord`** rows from chronological minute logs.
 * Non-finite or negative minute values are dropped from the series before windows.
 */
export function buildMinutesAvailabilityFeatures(input: MinutesAvailabilityInput): ContextFeatureRecord[] {
  const raw: number[] = []
  for (const row of input.gameLogRowsChronological) {
    const m = row.minutes
    if (typeof m === 'number' && Number.isFinite(m) && m >= 0) raw.push(m)
  }
  if (raw.length === 0) return []

  const l5 = lastN(raw, 5).map((x) => x)
  const l10 = lastN(raw, 10).map((x) => x)

  const l5Avg = mean(l5)
  const l10Avg = mean(l10)
  const trend = l5Avg - l10Avg
  const stdL10 = sampleStdDev(l10)
  const recentMax = l10.length ? Math.max(...l10) : null

  const played = (xs: number[]) => xs.filter((x) => x > 0).length
  const gpL5 = played(l5)
  const gpL10 = played(l10)

  const lastMin = raw[raw.length - 1]!
  const dnpRaw = lastMin <= 0 ? 1 : 0

  const stdForBucket = stdL10 ?? sampleStdDev(l5)
  const bucketRaw = consistencyBucket(stdForBucket)

  const base = {
    family: FAMILY,
    asOfUtc: input.asOfUtc,
    subjectId: input.subjectId,
    provenance: PROVENANCE,
  }

  const out: ContextFeatureRecord[] = [
    {
      ...base,
      key: 'minutes_l5_avg',
      kind: 'unknown',
      value: num(l5Avg, 'unknown', { decimals: 2 }),
    },
    {
      ...base,
      key: 'minutes_l10_avg',
      kind: 'unknown',
      value: num(l10Avg, 'unknown', { decimals: 2 }),
    },
    {
      ...base,
      key: 'minutes_trend_delta',
      kind: 'unknown',
      value: num(trend, 'unknown', { decimals: 2 }),
    },
    {
      ...base,
      key: 'minutes_std_dev_l10',
      kind: 'unknown',
      value: stdL10 == null ? null : num(stdL10, 'unknown', { decimals: 2 }),
    },
    {
      ...base,
      key: 'minutes_recent_max',
      kind: 'unknown',
      value: recentMax == null ? null : num(recentMax, 'unknown', { decimals: 2 }),
    },
    {
      ...base,
      key: 'games_played_l5',
      kind: 'count',
      value: num(gpL5, 'count'),
    },
    {
      ...base,
      key: 'games_played_l10',
      kind: 'count',
      value: num(gpL10, 'count'),
    },
    {
      ...base,
      key: 'recent_dnp_flag',
      kind: 'ratio',
      value: num(dnpRaw, 'ratio', { clamp: [0, 1] }),
    },
    {
      ...base,
      key: 'minutes_consistency_bucket',
      kind: 'categorical',
      value: bucketRaw == null ? null : normalizeContextFeatureValue(bucketRaw, 'categorical'),
    },
  ]

  return out
}
