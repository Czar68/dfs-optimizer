import {
  normalizeContextFeatureValue,
  type ContextFeatureRecord,
  FEATURE_INPUT_MODULE_PREFIX,
} from '../src/feature_input'

describe('Phase 87 — feature input foundation', () => {
  it('FEATURE_INPUT_MODULE_PREFIX documents the layer root', () => {
    expect(FEATURE_INPUT_MODULE_PREFIX).toBe('src/feature_input')
  })

  it('normalizeContextFeatureValue is deterministic for numeric kinds', () => {
    expect(normalizeContextFeatureValue('0.123456789', 'ratio')).toBe(0.123457)
    expect(normalizeContextFeatureValue(3.7, 'count')).toBe(4)
    expect(normalizeContextFeatureValue(-1, 'count')).toBe(0)
    expect(normalizeContextFeatureValue(1.234567, 'zscore')).toBe(1.2346)
  })

  it('normalizeContextFeatureValue clamps when requested', () => {
    expect(normalizeContextFeatureValue(99, 'ratio', { clamp: [0, 1] })).toBe(1)
    expect(normalizeContextFeatureValue(-0.1, 'ratio', { clamp: [0, 1] })).toBe(0)
  })

  it('normalizeContextFeatureValue handles categorical', () => {
    expect(normalizeContextFeatureValue('  home  ', 'categorical')).toBe('home')
    expect(normalizeContextFeatureValue('', 'categorical')).toBe(null)
  })

  it('ContextFeatureRecord shape is structurally valid for a minimal row', () => {
    const row: ContextFeatureRecord = {
      key: 'l5_pts_per_game',
      family: 'rolling_form',
      kind: 'ratio',
      asOfUtc: '2025-03-22T12:00:00.000Z',
      subjectId: 'leg-abc',
      value: 22.5,
      provenance: 'fixture',
    }
    expect(row.key).toMatch(/^l5_/)
  })
})
