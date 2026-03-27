import {
  buildFeatureSnapshot,
  joinContextFeaturesForSubject,
  type ContextFeatureRecord,
} from '../src/feature_input'

describe('Phase 93 — feature snapshot', () => {
  const t = '2025-03-22T12:00:00.000Z'
  const sid = 'pick-1'

  it('matches join output under featureFamilies', () => {
    const records: ContextFeatureRecord[] = [
      {
        key: 'rolling_form_l5_hit_rate',
        family: 'rolling_form',
        kind: 'ratio',
        asOfUtc: t,
        subjectId: sid,
        value: 0.55,
      },
      {
        key: 'game_total',
        family: 'game_environment',
        kind: 'unknown',
        asOfUtc: t,
        subjectId: sid,
        value: 218,
      },
    ]
    const snap = buildFeatureSnapshot({ subjectId: sid, asOfUtc: t, records })
    const joined = joinContextFeaturesForSubject({ subjectId: sid, asOfUtc: t, records })
    expect(snap.subjectId).toBe(joined.subjectId)
    expect(snap.asOfUtc).toBe(joined.asOfUtc)
    expect(snap.featureFamilies).toEqual(joined.features)
  })

  it('is JSON-serializable', () => {
    const snap = buildFeatureSnapshot({
      subjectId: sid,
      asOfUtc: t,
      records: [
        {
          key: 'k',
          family: 'other',
          kind: 'categorical',
          asOfUtc: t,
          subjectId: sid,
          value: 'x',
        },
      ],
    })
    expect(() => JSON.parse(JSON.stringify(snap))).not.toThrow()
    expect(JSON.parse(JSON.stringify(snap)).featureFamilies.other.k).toBe('x')
  })
})
