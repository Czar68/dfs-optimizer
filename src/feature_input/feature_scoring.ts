/**
 * Phase 94 / 94B — Deterministic non-EV signals from **`FeatureSnapshot`** (not a model; not optimizer input).
 *
 * **minutes_signal** (`minutes_availability` only): **`minutes_l5_avg` / 48** base; multiply by **(1 − variance penalty)** when **`minutes_std_dev_l10`** present (penalty = **`clamp01(std/20) × 0.45`** max); add **positive** **`minutes_trend_delta`** bonus (**`clamp01(max(0,Δ)/12) × 0.2`**). All **[0,1]**.
 *
 * **usage_signal** (**`usg_last5`**, **`usg_season`**, **`usg_delta_last5_vs_season`** only — searched across families, typically **`other`**): normalize each USG as **`>1` → `/100` else as-is**, mean of present **`usg_last5`/`usg_season`**; if **`usg_delta_last5_vs_season` > 0**, add **`clamp01(Δ/8)×0.12`**. No rolling_form / games_played / DNP.
 *
 * **environment_signal** (`game_environment`): **mean** of available among bucket score (low **0.25** / medium **0.55** / high **0.85**), **`clamp01((game_total−210)/40)`**, **`clamp01(spread_abs/14)`** — combined, not sequential fallback.
 *
 * **defense_signal** (`team_defense_context`): **`composite_defense_score`** or **`opp_points_allowed_rank`/30**.
 */
import type { FeatureSnapshot } from './feature_snapshot'
import type { ContextFeatureValueMap } from './feature_join'

const NB_MAX_MINUTES = 48
const SPREAD_ABS_SCALE = 14
const GAME_TOTAL_CENTER = 210
const GAME_TOTAL_SPREAD = 40

/** Deterministic family scan order for **`usg_*`** keys (no overlap with other feature keys). */
const USG_FAMILY_ORDER = [
  'other',
  'matchup_context',
  'schedule_rest',
  'home_away_split',
  'rolling_form',
  'minutes_availability',
  'game_environment',
  'team_defense_context',
] as const

export interface FeatureScoreSignals {
  subjectId: string
  asOfUtc: string
  signals: {
    minutes_signal: number
    usage_signal: number
    environment_signal: number
    defense_signal: number
  }
}

function num(m: ContextFeatureValueMap | undefined, key: string): number | null {
  if (!m) return null
  const v = m[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(m: ContextFeatureValueMap | undefined, key: string): string | null {
  if (!m) return null
  const v = m[key]
  return typeof v === 'string' && v.length ? v : null
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.min(1, Math.max(0, x))
}

function numUsageKey(ff: FeatureSnapshot['featureFamilies'], key: string): number | null {
  for (const fam of USG_FAMILY_ORDER) {
    const v = num(ff[fam], key)
    if (v != null) return v
  }
  return null
}

/** USG as decimal or percent (0–100). */
function normUsg(x: number): number {
  if (x > 1 && x <= 100) return clamp01(x / 100)
  return clamp01(x)
}

function scoreMinutes(f: FeatureSnapshot['featureFamilies']): number {
  const m = f.minutes_availability
  const l5 = num(m, 'minutes_l5_avg')
  const std = num(m, 'minutes_std_dev_l10')
  const trend = num(m, 'minutes_trend_delta')

  let base = l5 != null ? clamp01(l5 / NB_MAX_MINUTES) : 0

  if (std != null) {
    const pen = clamp01(std / 20) * 0.45
    base *= 1 - pen
  }

  let bonus = 0
  if (trend != null && trend > 0) {
    bonus = clamp01(trend / 12) * 0.2
  }

  return clamp01(base + bonus)
}

function scoreUsage(f: FeatureSnapshot['featureFamilies']): number {
  const u5 = numUsageKey(f, 'usg_last5')
  const us = numUsageKey(f, 'usg_season')
  const d = numUsageKey(f, 'usg_delta_last5_vs_season')

  const parts: number[] = []
  if (u5 != null) parts.push(normUsg(u5))
  if (us != null) parts.push(normUsg(us))
  let s = parts.length ? clamp01(parts.reduce((a, b) => a + b, 0) / parts.length) : 0

  if (d != null && d > 0) {
    s = clamp01(s + clamp01(d / 8) * 0.12)
  }

  return clamp01(s)
}

function bucketScore(bucket: string | null): number | null {
  if (bucket === 'low') return 0.25
  if (bucket === 'medium') return 0.55
  if (bucket === 'high') return 0.85
  return null
}

function scoreEnvironment(f: FeatureSnapshot['featureFamilies']): number {
  const g = f.game_environment
  const parts: number[] = []

  const b = bucketScore(str(g, 'blowout_risk_bucket'))
  if (b != null) parts.push(b)

  const gt = num(g, 'game_total')
  if (gt != null) parts.push(clamp01((gt - GAME_TOTAL_CENTER) / GAME_TOTAL_SPREAD))

  const sa = num(g, 'spread_abs')
  if (sa != null) parts.push(clamp01(sa / SPREAD_ABS_SCALE))

  if (parts.length === 0) return 0
  return clamp01(parts.reduce((a, b) => a + b, 0) / parts.length)
}

function scoreDefense(f: FeatureSnapshot['featureFamilies']): number {
  const t = f.team_defense_context
  const comp = num(t, 'composite_defense_score')
  if (comp != null) return clamp01(comp)

  const r = num(t, 'opp_points_allowed_rank')
  if (r != null) return clamp01(r / 30)

  return 0
}

export function scoreFeatureSnapshot(snapshot: FeatureSnapshot): FeatureScoreSignals {
  const { subjectId, asOfUtc, featureFamilies: ff } = snapshot
  return {
    subjectId,
    asOfUtc,
    signals: {
      minutes_signal: scoreMinutes(ff),
      usage_signal: scoreUsage(ff),
      environment_signal: scoreEnvironment(ff),
      defense_signal: scoreDefense(ff),
    },
  }
}
