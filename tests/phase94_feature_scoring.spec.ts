import { buildFeatureSnapshot, scoreFeatureSnapshot, type ContextFeatureRecord } from '../src/feature_input'

describe('Phase 94 / 94B — feature scoring (non-EV)', () => {
  const base = { subjectId: 's1', asOfUtc: '2025-03-22T12:00:00.000Z' }

  function rec(p: Omit<ContextFeatureRecord, 'asOfUtc' | 'subjectId'>): ContextFeatureRecord {
    return { ...p, ...base }
  }

  it('empty snapshot yields zeros', () => {
    const snap = buildFeatureSnapshot({ ...base, records: [] })
    const sc = scoreFeatureSnapshot(snap)
    expect(sc.signals).toEqual({
      minutes_signal: 0,
      usage_signal: 0,
      environment_signal: 0,
      defense_signal: 0,
    })
  })

  it('minutes_signal uses L5, std penalty, positive trend bonus', () => {
    const snap = buildFeatureSnapshot({
      ...base,
      records: [
        rec({ key: 'minutes_l5_avg', family: 'minutes_availability', kind: 'unknown', value: 36 }),
        rec({ key: 'minutes_std_dev_l10', family: 'minutes_availability', kind: 'unknown', value: 4 }),
        rec({ key: 'minutes_trend_delta', family: 'minutes_availability', kind: 'unknown', value: 6 }),
      ],
    })
    const baseM = 36 / 48
    const pen = Math.min(1, 4 / 20) * 0.45
    const afterVar = baseM * (1 - pen)
    const bonus = Math.min(1, 6 / 12) * 0.2
    expect(scoreFeatureSnapshot(snap).signals.minutes_signal).toBeCloseTo(Math.min(1, afterVar + bonus), 5)
  })

  it('usage_signal uses only usg_* keys (not rolling_form)', () => {
    const onlyRolling = buildFeatureSnapshot({
      ...base,
      records: [rec({ key: 'rolling_form_l5_hit_rate', family: 'rolling_form', kind: 'ratio', value: 0.9 })],
    })
    expect(scoreFeatureSnapshot(onlyRolling).signals.usage_signal).toBe(0)

    const usage = buildFeatureSnapshot({
      ...base,
      records: [
        rec({ key: 'usg_last5', family: 'other', kind: 'unknown', value: 25 }),
        rec({ key: 'usg_season', family: 'other', kind: 'unknown', value: 28 }),
        rec({ key: 'usg_delta_last5_vs_season', family: 'other', kind: 'unknown', value: 4 }),
      ],
    })
    const meanUsg = (0.25 + 0.28) / 2
    const withDelta = Math.min(1, meanUsg + Math.min(1, 4 / 8) * 0.12)
    expect(scoreFeatureSnapshot(usage).signals.usage_signal).toBeCloseTo(withDelta, 5)
  })

  it('environment_signal averages bucket, game_total, spread_abs when combined', () => {
    const snap = buildFeatureSnapshot({
      ...base,
      records: [
        rec({ key: 'blowout_risk_bucket', family: 'game_environment', kind: 'categorical', value: 'medium' }),
        rec({ key: 'game_total', family: 'game_environment', kind: 'unknown', value: 230 }),
        rec({ key: 'spread_abs', family: 'game_environment', kind: 'unknown', value: 7 }),
      ],
    })
    const p1 = 0.55
    const p2 = Math.min(1, (230 - 210) / 40)
    const p3 = Math.min(1, 7 / 14)
    expect(scoreFeatureSnapshot(snap).signals.environment_signal).toBeCloseTo((p1 + p2 + p3) / 3, 5)
  })

  it('defense_signal from composite or rank', () => {
    const a = buildFeatureSnapshot({
      ...base,
      records: [rec({ key: 'composite_defense_score', family: 'team_defense_context', kind: 'unknown', value: 0.7 })],
    })
    expect(scoreFeatureSnapshot(a).signals.defense_signal).toBe(0.7)

    const b = buildFeatureSnapshot({
      ...base,
      records: [rec({ key: 'opp_points_allowed_rank', family: 'team_defense_context', kind: 'count', value: 15 })],
    })
    expect(scoreFeatureSnapshot(b).signals.defense_signal).toBeCloseTo(0.5, 5)
  })
})
