import { buildGameEnvironmentFeatures } from '../src/feature_input'

function byKey(rows: ReturnType<typeof buildGameEnvironmentFeatures>) {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

describe('Phase 90 — game environment features', () => {
  const base = { subjectId: 'leg-1', asOfUtc: '2025-03-22T12:00:00.000Z' }

  it('returns empty when no market fields present', () => {
    expect(buildGameEnvironmentFeatures({ ...base })).toEqual([])
    expect(buildGameEnvironmentFeatures({ ...base, gameTotal: null, spread: null })).toEqual([])
  })

  it('spread-only: spread, spread_abs, favorite, blowout; no implied totals', () => {
    const o = byKey(buildGameEnvironmentFeatures({ ...base, spread: -5.5 }))
    expect(o.spread).toBe(-5.5)
    expect(o.spread_abs).toBe(5.5)
    expect(o.favorite_flag).toBe(0)
    expect(o.blowout_risk_bucket).toBe('medium')
    expect(o.team_implied_total).toBeUndefined()
    expect(o.game_total).toBeUndefined()
  })

  it('favorite when spread positive', () => {
    const o = byKey(buildGameEnvironmentFeatures({ ...base, spread: 3 }))
    expect(o.favorite_flag).toBe(1)
    expect(o.blowout_risk_bucket).toBe('low')
  })

  it('spread 0: no favorite_flag; blowout low', () => {
    const o = byKey(buildGameEnvironmentFeatures({ ...base, spread: 0, gameTotal: 220 }))
    expect(o.favorite_flag).toBeUndefined()
    expect(o.blowout_risk_bucket).toBe('low')
    expect(o.team_implied_total).toBe(110)
    expect(o.opponent_implied_total).toBe(110)
    expect(o.implied_total_delta_vs_game).toBe(0)
  })

  it('game total + spread: implied totals and delta', () => {
    const o = byKey(
      buildGameEnvironmentFeatures({
        ...base,
        gameTotal: 220,
        spread: 10,
      })
    )
    expect(o.game_total).toBe(220)
    expect(o.team_implied_total).toBe(115)
    expect(o.opponent_implied_total).toBe(105)
    expect(o.implied_total_delta_vs_game).toBe(5)
  })

  it('high blowout bucket for large spread', () => {
    const o = byKey(buildGameEnvironmentFeatures({ ...base, spread: -12 }))
    expect(o.blowout_risk_bucket).toBe('high')
  })
})
