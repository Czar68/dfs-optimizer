/**
 * Phase 90 — Game environment from pre-parsed market lines only (no fetching; callers supply OddsAPI-style fields when available).
 */
import type { ContextFeatureFamily, ContextFeatureRecord, FeatureValueKind } from './context_feature_contract'
import { normalizeContextFeatureValue } from './normalize_context_feature_value'

const FAMILY: ContextFeatureFamily = 'game_environment'
const PROVENANCE = 'feature_input/game_environment_features'

export interface GameEnvironmentInput {
  subjectId: string
  asOfUtc: string
  /** Main game total (points), when caller already has it. */
  gameTotal?: number | null
  /**
   * Subject team's closing/main spread: positive = subject team favored by that many points.
   * Omit when unknown.
   */
  spread?: number | null
}

function add(
  out: ContextFeatureRecord[],
  base: Omit<ContextFeatureRecord, 'key' | 'kind' | 'value'>,
  key: string,
  kind: FeatureValueKind,
  raw: number | string | null | undefined,
  opts?: Parameters<typeof normalizeContextFeatureValue>[2]
): void {
  if (raw === null || raw === undefined) return
  if (typeof raw === 'number' && !Number.isFinite(raw)) return
  const v = normalizeContextFeatureValue(raw, kind, opts ?? {})
  if (v === null) return
  out.push({ ...base, key, kind, value: v })
}

/** Deterministic blowout script risk from absolute spread (points). */
function blowoutBucket(spreadAbs: number): 'low' | 'medium' | 'high' {
  if (spreadAbs <= 3) return 'low'
  if (spreadAbs <= 7) return 'medium'
  return 'high'
}

/**
 * Emits **`ContextFeatureRecord`** rows for whatever inputs are present.
 * When both **`gameTotal`** and **`spread`** exist, derives team/opponent implied totals and delta vs half the game total.
 */
export function buildGameEnvironmentFeatures(input: GameEnvironmentInput): ContextFeatureRecord[] {
  const base: Omit<ContextFeatureRecord, 'key' | 'kind' | 'value'> = {
    family: FAMILY,
    asOfUtc: input.asOfUtc,
    subjectId: input.subjectId,
    provenance: PROVENANCE,
  }

  const out: ContextFeatureRecord[] = []

  const gt = input.gameTotal
  const sp = input.spread

  add(out, base, 'game_total', 'unknown', gt, { decimals: 2 })
  add(out, base, 'spread', 'unknown', sp, { decimals: 2 })

  if (typeof sp === 'number' && Number.isFinite(sp)) {
    add(out, base, 'spread_abs', 'unknown', Math.abs(sp), { decimals: 2 })
  }

  if (typeof sp === 'number' && Number.isFinite(sp) && sp !== 0) {
    add(out, base, 'favorite_flag', 'ratio', sp > 0 ? 1 : 0, { clamp: [0, 1] })
  }

  if (typeof gt === 'number' && Number.isFinite(gt) && typeof sp === 'number' && Number.isFinite(sp)) {
    const teamImplied = (gt + sp) / 2
    const oppImplied = (gt - sp) / 2
    const half = gt / 2
    const delta = teamImplied - half
    add(out, base, 'team_implied_total', 'unknown', teamImplied, { decimals: 2 })
    add(out, base, 'opponent_implied_total', 'unknown', oppImplied, { decimals: 2 })
    add(out, base, 'implied_total_delta_vs_game', 'unknown', delta, { decimals: 2 })
  }

  if (typeof sp === 'number' && Number.isFinite(sp)) {
    const b = blowoutBucket(Math.abs(sp))
    add(out, base, 'blowout_risk_bucket', 'categorical', b)
  }

  return out
}
