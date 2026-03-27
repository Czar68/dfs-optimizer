import type { FeatureValueKind } from './context_feature_contract'

export interface NormalizeContextFeatureOptions {
  /** Inclusive bounds for numeric kinds (applied after coercion). */
  clamp?: readonly [number, number]
  /** Decimal places for finite numbers (default by kind). */
  decimals?: number
}

function roundFixed(n: number, decimals: number): number {
  const p = 10 ** decimals
  return Math.round(n * p) / p
}

/**
 * Deterministic normalization for pipeline-fed context features.
 * Does not interpret sports meaning — only coerces, clamps, and rounds.
 */
export function normalizeContextFeatureValue(
  raw: unknown,
  kind: FeatureValueKind,
  opts: NormalizeContextFeatureOptions = {}
): number | string | null {
  if (raw === null || raw === undefined) return null

  if (kind === 'categorical') {
    if (typeof raw === 'string') {
      const t = raw.trim()
      return t.length ? t : null
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    return null
  }

  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN
  if (!Number.isFinite(n)) return null

  let x = n
  const clamp = opts.clamp
  if (clamp) {
    x = Math.min(Math.max(x, clamp[0]), clamp[1])
  }

  let decimals = opts.decimals
  if (decimals === undefined) {
    if (kind === 'ratio') decimals = 6
    else if (kind === 'count') decimals = 0
    else if (kind === 'zscore') decimals = 4
    else decimals = 6
  }

  if (kind === 'count') {
    const i = Math.round(x)
    if (!Number.isFinite(i)) return null
    return Math.max(0, i)
  }

  return roundFixed(x, decimals)
}
