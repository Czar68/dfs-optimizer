import {
  attachFeatureContextToPick,
  summarizeFeatureSignals,
  type ContextFeatureRecord,
} from '../src/feature_input'
import type { EvPick } from '../src/types'

function basePick(id: string): EvPick {
  return {
    id,
    sport: 'NBA',
    site: 'prizepicks',
    league: 'NBA',
    player: 'X',
    team: null,
    opponent: null,
    stat: 'points',
    line: 20,
    projectionId: 'p',
    gameId: null,
    startTime: null,
    outcome: 'over',
    trueProb: 0.5,
    fairOdds: -110,
    edge: 0,
    book: null,
    overOdds: null,
    underOdds: null,
    legEv: 0,
    isNonStandardOdds: false,
  }
}

describe('Phase 96 — feature diagnostics', () => {
  const t = '2025-03-22T12:00:00.000Z'
  const emptyRecords: ContextFeatureRecord[] = []

  it('empty or no featureSignals yields count 0 and zero stats', () => {
    expect(summarizeFeatureSignals([]).count).toBe(0)
    expect(summarizeFeatureSignals([basePick('a')])).toEqual({
      count: 0,
      minutes_signal: { mean: 0, min: 0, max: 0 },
      usage_signal: { mean: 0, min: 0, max: 0 },
      environment_signal: { mean: 0, min: 0, max: 0 },
      defense_signal: { mean: 0, min: 0, max: 0 },
    })
  })

  it('aggregates mean min max over picks with signals', () => {
    const input = { subjectId: 'a', asOfUtc: t, records: emptyRecords }
    const p1 = attachFeatureContextToPick(basePick('1'), input)
    const p2 = attachFeatureContextToPick(basePick('2'), input)
    const s = summarizeFeatureSignals([p1, p2])
    expect(s.count).toBe(2)
    expect(s.minutes_signal.mean).toBe(0)
    expect(s.minutes_signal.min).toBe(0)
    expect(s.minutes_signal.max).toBe(0)
    expect(s.defense_signal.mean).toBe(0)
  })
})
