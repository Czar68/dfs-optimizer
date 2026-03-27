/**
 * Phase 96 — Read-only aggregates over **`featureSignals`** on **`EvPick`** (no filtering, no decisions).
 */
import type { EvPick } from '../types'

export interface SignalAxisStats {
  mean: number
  min: number
  max: number
}

export interface FeatureSignalsSummary {
  /** Picks with **`featureSignals`** present. */
  count: number
  minutes_signal: SignalAxisStats
  usage_signal: SignalAxisStats
  environment_signal: SignalAxisStats
  defense_signal: SignalAxisStats
}

function stat(values: number[]): SignalAxisStats {
  if (values.length === 0) return { mean: 0, min: 0, max: 0 }
  let minV = values[0]!
  let maxV = values[0]!
  let sum = 0
  for (const v of values) {
    sum += v
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  return { mean: sum / values.length, min: minV, max: maxV }
}

function axis(p: EvPick, key: keyof NonNullable<EvPick['featureSignals']>['signals']): number {
  const v = p.featureSignals?.signals[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Aggregates **`signals`** over picks that have **`featureSignals`** attached. */
export function summarizeFeatureSignals(picks: readonly EvPick[]): FeatureSignalsSummary {
  const withSig = picks.filter((p) => p.featureSignals != null)
  const n = withSig.length
  if (n === 0) {
    return {
      count: 0,
      minutes_signal: { mean: 0, min: 0, max: 0 },
      usage_signal: { mean: 0, min: 0, max: 0 },
      environment_signal: { mean: 0, min: 0, max: 0 },
      defense_signal: { mean: 0, min: 0, max: 0 },
    }
  }

  const m = withSig.map((p) => axis(p, 'minutes_signal'))
  const u = withSig.map((p) => axis(p, 'usage_signal'))
  const e = withSig.map((p) => axis(p, 'environment_signal'))
  const d = withSig.map((p) => axis(p, 'defense_signal'))

  return {
    count: n,
    minutes_signal: stat(m),
    usage_signal: stat(u),
    environment_signal: stat(e),
    defense_signal: stat(d),
  }
}
