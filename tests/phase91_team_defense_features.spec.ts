import { buildTeamDefenseFeatures } from '../src/feature_input'

function byKey(rows: ReturnType<typeof buildTeamDefenseFeatures>) {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

describe('Phase 91 — team defense features', () => {
  const base = { subjectId: 'opp-LAL', asOfUtc: '2025-03-22T12:00:00.000Z' }

  it('returns empty when no opponent fields', () => {
    expect(buildTeamDefenseFeatures({ ...base })).toEqual([])
  })

  it('maps numeric stats and normalizes FG% from 0–100', () => {
    const o = byKey(
      buildTeamDefenseFeatures({
        ...base,
        oppPointsAllowed: 112.5,
        oppFgPctAllowed: 47.2,
        opp3pPctAllowed: 0.365,
        oppReboundsAllowed: 44,
        oppAssistsAllowed: 26,
      })
    )
    expect(o.opp_points_allowed).toBe(112.5)
    expect(o.opp_fg_pct_allowed).toBe(0.472)
    expect(o.opp_3p_pct_allowed).toBe(0.365)
    expect(o.opp_rebounds_allowed).toBe(44)
    expect(o.opp_assists_allowed).toBe(26)
    expect(o.composite_defense_score).toBeUndefined()
  })

  it('includes def rating and ranks; composite when both ranks present', () => {
    const o = byKey(
      buildTeamDefenseFeatures({
        ...base,
        oppDefRating: 114.2,
        oppPointsAllowedRank: 28,
        oppFgPctAllowedRank: 25,
      })
    )
    expect(o.opp_def_rating).toBe(114.2)
    expect(o.opp_points_allowed_rank).toBe(28)
    expect(o.opp_fg_pct_allowed_rank).toBe(25)
    expect(o.composite_defense_score).toBeCloseTo((28 / 30 + 25 / 30) / 2, 4)
  })

  it('omits composite with only one rank', () => {
    const o = byKey(
      buildTeamDefenseFeatures({
        ...base,
        oppPointsAllowedRank: 10,
      })
    )
    expect(o.opp_points_allowed_rank).toBe(10)
    expect(o.composite_defense_score).toBeUndefined()
  })
})
