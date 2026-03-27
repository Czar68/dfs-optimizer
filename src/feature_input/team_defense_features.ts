/**
 * Phase 91 — Opponent team defensive profile (caller-supplied aggregates; no I/O).
 */
import type { ContextFeatureFamily, ContextFeatureRecord, FeatureValueKind } from './context_feature_contract'
import { normalizeContextFeatureValue } from './normalize_context_feature_value'

const FAMILY: ContextFeatureFamily = 'team_defense_context'
const PROVENANCE = 'feature_input/team_defense_features'
/** NBA team count for rank normalization (composite only). */
const LEAGUE_SIZE = 30

export interface TeamDefenseInput {
  subjectId: string
  asOfUtc: string
  /** Opponent defensive stats — season or rolling, as provided by caller. */
  oppPointsAllowed?: number | null
  /** FG% allowed **0–1** or **0–100** (latter scaled). */
  oppFgPctAllowed?: number | null
  opp3pPctAllowed?: number | null
  oppReboundsAllowed?: number | null
  oppAssistsAllowed?: number | null
  /** Defensive rating (e.g. pts allowed per 100 poss), league-specific scale. */
  oppDefRating?: number | null
  /** Overall league rank **1..30** (caller convention: **30** = weakest defense if applicable). */
  oppPointsAllowedRank?: number | null
  oppFgPctAllowedRank?: number | null
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

/** Map **0–100** percentage to **0–1** when clearly intended. */
function asUnitIntervalPct(x: number): number {
  if (x > 1 && x <= 100) return x / 100
  return x
}

/**
 * **`composite_defense_score`**: mean(**rank / LEAGUE_SIZE**) when **both** rank fields are present (simple blend).
 */
export function buildTeamDefenseFeatures(input: TeamDefenseInput): ContextFeatureRecord[] {
  const base: Omit<ContextFeatureRecord, 'key' | 'kind' | 'value'> = {
    family: FAMILY,
    asOfUtc: input.asOfUtc,
    subjectId: input.subjectId,
    provenance: PROVENANCE,
  }

  const out: ContextFeatureRecord[] = []

  add(out, base, 'opp_points_allowed', 'unknown', input.oppPointsAllowed, { decimals: 2 })

  if (typeof input.oppFgPctAllowed === 'number' && Number.isFinite(input.oppFgPctAllowed)) {
    const r = asUnitIntervalPct(input.oppFgPctAllowed)
    add(out, base, 'opp_fg_pct_allowed', 'ratio', r, { clamp: [0, 1] })
  }
  if (typeof input.opp3pPctAllowed === 'number' && Number.isFinite(input.opp3pPctAllowed)) {
    const r = asUnitIntervalPct(input.opp3pPctAllowed)
    add(out, base, 'opp_3p_pct_allowed', 'ratio', r, { clamp: [0, 1] })
  }

  add(out, base, 'opp_rebounds_allowed', 'unknown', input.oppReboundsAllowed, { decimals: 2 })
  add(out, base, 'opp_assists_allowed', 'unknown', input.oppAssistsAllowed, { decimals: 2 })
  add(out, base, 'opp_def_rating', 'unknown', input.oppDefRating, { decimals: 2 })

  add(out, base, 'opp_points_allowed_rank', 'count', input.oppPointsAllowedRank)
  add(out, base, 'opp_fg_pct_allowed_rank', 'count', input.oppFgPctAllowedRank)

  const pr = input.oppPointsAllowedRank
  const fr = input.oppFgPctAllowedRank
  if (
    typeof pr === 'number' &&
    Number.isFinite(pr) &&
    typeof fr === 'number' &&
    Number.isFinite(fr)
  ) {
    const rawComposite = (pr / LEAGUE_SIZE + fr / LEAGUE_SIZE) / 2
    add(out, base, 'composite_defense_score', 'unknown', rawComposite, { decimals: 4 })
  }

  return out
}
