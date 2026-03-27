import {
  attachFeatureContextToCard,
  attachFeatureContextToPick,
  type ContextFeatureRecord,
} from '../src/feature_input'
import type { CardEvResult, EvPick } from '../src/types'

describe('Phase 95 — attach feature context to picks/cards', () => {
  const t = '2025-03-22T12:00:00.000Z'
  const input = {
    subjectId: 'leg-1',
    asOfUtc: t,
    records: [
      {
        key: 'composite_defense_score',
        family: 'team_defense_context' as const,
        kind: 'unknown' as const,
        subjectId: 'leg-1',
        asOfUtc: t,
        value: 0.4,
      },
    ] satisfies ContextFeatureRecord[],
  }

  const minimalPick: EvPick = {
    id: 'leg-1',
    sport: 'NBA',
    site: 'prizepicks',
    league: 'NBA',
    player: 'A',
    team: null,
    opponent: null,
    stat: 'points',
    line: 25,
    projectionId: 'p',
    gameId: null,
    startTime: null,
    outcome: 'over',
    trueProb: 0.55,
    fairOdds: -110,
    edge: 0.05,
    book: null,
    overOdds: null,
    underOdds: null,
    legEv: 0.02,
    isNonStandardOdds: false,
  }

  const minimalCard: CardEvResult = {
    flexType: '2P',
    legs: [{ pick: minimalPick, side: 'over' }],
    stake: 1,
    totalReturn: 2,
    expectedValue: 0.1,
    winProbability: 0.5,
    cardEv: 0.1,
    winProbCash: 0.4,
    winProbAny: 0.5,
    avgProb: 0.55,
    avgEdgePct: 5,
    hitDistribution: {},
  }

  it('attachFeatureContextToPick adds snapshot + signals', () => {
    const p = attachFeatureContextToPick(minimalPick, input)
    expect(p.featureSnapshot?.subjectId).toBe('leg-1')
    expect(p.featureSignals?.signals.defense_signal).toBe(0.4)
  })

  it('attachFeatureContextToCard adds snapshot + signals', () => {
    const c = attachFeatureContextToCard(minimalCard, input)
    expect(c.featureSnapshot?.featureFamilies.team_defense_context?.composite_defense_score).toBe(0.4)
    expect(JSON.parse(JSON.stringify(c)).featureSignals).toBeDefined()
  })
})
