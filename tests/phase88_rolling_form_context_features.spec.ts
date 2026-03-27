import { buildRollingFormBinaryFeatures } from '../src/feature_input'

describe('Phase 88 — rolling form context features', () => {
  const base = {
    subjectId: 'sub-1',
    asOfUtc: '2025-03-22T12:00:00.000Z',
  }

  it('emits L5 and L10 when enough binary history exists', () => {
    const rows = buildRollingFormBinaryFeatures({
      ...base,
      priorBinaryOutcomesOldestFirst: [0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1],
    })
    const l5 = rows.find((r) => r.key === 'rolling_form_l5_hit_rate')
    const l10 = rows.find((r) => r.key === 'rolling_form_l10_hit_rate')
    expect(l5?.value).toBe(0.8)
    expect(l10?.value).toBe(0.7)
    expect(l5?.family).toBe('rolling_form')
    expect(l5?.provenance).toContain('rolling_form')
  })

  it('ignores non-binary entries', () => {
    const rows = buildRollingFormBinaryFeatures({
      ...base,
      priorBinaryOutcomesOldestFirst: [0, 1, 2, 1, 0],
    })
    const l5 = rows.find((r) => r.key === 'rolling_form_l5_hit_rate')
    expect(l5?.value).toBe(0.5)
  })

  it('emits both rows when 5–9 games (L10 window uses all available)', () => {
    const rows = buildRollingFormBinaryFeatures({
      ...base,
      priorBinaryOutcomesOldestFirst: [1, 0, 1, 0, 1],
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.key)).toEqual(['rolling_form_l5_hit_rate', 'rolling_form_l10_hit_rate'])
    const l5 = rows.find((r) => r.key === 'rolling_form_l5_hit_rate')
    const l10 = rows.find((r) => r.key === 'rolling_form_l10_hit_rate')
    expect(l5?.value).toBe(0.6)
    expect(l10?.value).toBe(0.6)
  })

  it('returns empty when no valid binary outcomes', () => {
    expect(
      buildRollingFormBinaryFeatures({
        ...base,
        priorBinaryOutcomesOldestFirst: [2, 3, NaN],
      })
    ).toEqual([])
  })
})
