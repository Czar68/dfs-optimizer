import { buildMinutesAvailabilityFeatures } from '../src/feature_input'

function r(minutes: number) {
  return { minutes }
}

function byKey(rows: ReturnType<typeof buildMinutesAvailabilityFeatures>) {
  return Object.fromEntries(rows.map((x) => [x.key, x.value]))
}

describe('Phase 89 — minutes + availability features', () => {
  const base = {
    subjectId: 'player-1',
    asOfUtc: '2025-03-22T12:00:00.000Z',
  }

  it('returns empty when no valid minute rows', () => {
    expect(buildMinutesAvailabilityFeatures({ ...base, gameLogRowsChronological: [] })).toEqual([])
    expect(
      buildMinutesAvailabilityFeatures({
        ...base,
        gameLogRowsChronological: [r(NaN), r(-1)],
      })
    ).toEqual([])
  })

  it('flat 10-game log: stable minutes, low variance bucket', () => {
    const rows = buildMinutesAvailabilityFeatures({
      ...base,
      gameLogRowsChronological: Array.from({ length: 10 }, () => r(32)),
    })
    const o = byKey(rows)
    expect(o.minutes_l5_avg).toBe(32)
    expect(o.minutes_l10_avg).toBe(32)
    expect(o.minutes_trend_delta).toBe(0)
    expect(o.minutes_std_dev_l10).toBe(0)
    expect(o.minutes_recent_max).toBe(32)
    expect(o.games_played_l5).toBe(5)
    expect(o.games_played_l10).toBe(10)
    expect(o.recent_dnp_flag).toBe(0)
    expect(o.minutes_consistency_bucket).toBe('low')
  })

  it('rolling windows: last 5 vs last 10 means and trend', () => {
    const rows = buildMinutesAvailabilityFeatures({
      ...base,
      gameLogRowsChronological: [r(30), r(30), r(30), r(30), r(30), r(10), r(10), r(10), r(10), r(10)],
    })
    const o = byKey(rows)
    expect(o.minutes_l5_avg).toBe(10)
    expect(o.minutes_l10_avg).toBe(20)
    expect(o.minutes_trend_delta).toBe(-10)
  })

  it('fewer than 10 games: L10 uses all available; std when at least two games in L10 window', () => {
    const rows = buildMinutesAvailabilityFeatures({
      ...base,
      gameLogRowsChronological: [r(20), r(22), r(24)],
    })
    const o = byKey(rows)
    expect(o.minutes_l5_avg).toBe(22)
    expect(o.minutes_l10_avg).toBe(22)
    expect(o.minutes_std_dev_l10).toBe(2)
    expect(o.minutes_consistency_bucket).toBe('low')
  })

  it('single game: no std; consistency bucket null', () => {
    const o = byKey(
      buildMinutesAvailabilityFeatures({
        ...base,
        gameLogRowsChronological: [r(35)],
      })
    )
    expect(o.minutes_std_dev_l10).toBeNull()
    expect(o.minutes_consistency_bucket).toBeNull()
  })

  it('recent DNP: last game 0 minutes sets recent_dnp_flag', () => {
    const o = byKey(
      buildMinutesAvailabilityFeatures({
        ...base,
        gameLogRowsChronological: [r(30), r(28), r(0)],
      })
    )
    expect(o.recent_dnp_flag).toBe(1)
    expect(o.games_played_l5).toBe(2)
  })
})
