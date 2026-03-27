import {
  joinContextFeaturesForSubject,
  type ContextFeatureRecord,
} from '../src/feature_input'

describe('Phase 92 — feature join', () => {
  const t = '2025-03-22T12:00:00.000Z'
  const sid = 'player-x'

  function row(
    partial: Omit<ContextFeatureRecord, 'asOfUtc' | 'subjectId'>
  ): ContextFeatureRecord {
    return { ...partial, asOfUtc: t, subjectId: sid }
  }

  it('groups by family and maps key → value', () => {
    const records: ContextFeatureRecord[] = [
      row({
        key: 'rolling_form_l5_hit_rate',
        family: 'rolling_form',
        kind: 'ratio',
        value: 0.6,
      }),
      row({
        key: 'minutes_l5_avg',
        family: 'minutes_availability',
        kind: 'unknown',
        value: 32,
      }),
      row({
        key: 'game_total',
        family: 'game_environment',
        kind: 'unknown',
        value: 220,
      }),
    ]
    const j = joinContextFeaturesForSubject({ subjectId: sid, asOfUtc: t, records })
    expect(j.subjectId).toBe(sid)
    expect(j.asOfUtc).toBe(t)
    expect(j.features.rolling_form?.rolling_form_l5_hit_rate).toBe(0.6)
    expect(j.features.minutes_availability?.minutes_l5_avg).toBe(32)
    expect(j.features.game_environment?.game_total).toBe(220)
  })

  it('ignores rows with mismatched subject or time', () => {
    const j = joinContextFeaturesForSubject({
      subjectId: sid,
      asOfUtc: t,
      records: [
        row({ key: 'a', family: 'other', kind: 'count', value: 1 }),
        { ...row({ key: 'b', family: 'other', kind: 'count', value: 2 }), subjectId: 'other' },
        { ...row({ key: 'c', family: 'other', kind: 'count', value: 3 }), asOfUtc: '2020-01-01T00:00:00.000Z' },
      ],
    })
    expect(j.features.other).toEqual({ a: 1 })
  })

  it('last duplicate key in same family wins', () => {
    const j = joinContextFeaturesForSubject({
      subjectId: sid,
      asOfUtc: t,
      records: [
        row({ key: 'k', family: 'rolling_form', kind: 'ratio', value: 0.1 }),
        row({ key: 'k', family: 'rolling_form', kind: 'ratio', value: 0.9 }),
      ],
    })
    expect(j.features.rolling_form?.k).toBe(0.9)
  })

  it('empty when no rows match', () => {
    const j = joinContextFeaturesForSubject({
      subjectId: sid,
      asOfUtc: t,
      records: [],
    })
    expect(j.features).toEqual({})
  })
})
