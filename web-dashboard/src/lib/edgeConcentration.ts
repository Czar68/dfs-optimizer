/**
 * Phase 84 — Client-side aggregation over existing Card + LegsLookup only (no EV math).
 */
import type { Card, LegsLookup } from '../types'

const STAT_ABBREV: Record<string, string> = {
  points: 'PTS',
  rebounds: 'REB',
  assists: 'AST',
  threes: '3PM',
  steals: 'STL',
  blocks: 'BLK',
  fantasy_points: 'FP',
  pra: 'PRA',
  'pts+reb+ast': 'PRA',
  points_rebounds_assists: 'PRA',
  'pts+ast': 'PA',
  'pts+reb': 'PR',
  'reb+ast': 'RA',
  rebounds_assists: 'RA',
  turnovers: 'TO',
  stocks: 'STK',
}

function statLabel(stat: string): string {
  const s = stat?.toLowerCase() ?? ''
  return STAT_ABBREV[s] ?? (stat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown')
}

export function getLegIdsFromCard(c: Card): string[] {
  return [c.leg1Id, c.leg2Id, c.leg3Id, c.leg4Id, c.leg5Id, c.leg6Id, c.leg7Id, c.leg8Id].filter(
    (x): x is string => !!x
  )
}

function structureKey(c: Card): string {
  const ft = String(c.flexType ?? '').trim()
  return ft || `${getLegIdsFromCard(c).length}-leg`
}

export interface EdgeConcentrationResult {
  mode: 'cards' | 'near_miss_structures' | 'empty'
  nCards: number
  site: { pp: number; ud: number }
  structureCounts: [string, number][]
  statCounts: [string, number][]
  interpretation: string
}

function sortCounts(m: Map<string, number>, limit: number): [string, number][] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function buildInterpretation(
  n: number,
  site: { pp: number; ud: number },
  structureCounts: [string, number][],
  statCounts: [string, number][]
): string {
  if (n === 0) return 'Insufficient top-card rows in the synced CSV to summarize concentration.'

  const total = site.pp + site.ud
  const ppShare = total > 0 ? site.pp / total : 0
  let sitePhrase: string
  if (site.ud === 0) sitePhrase = 'PP only in this slice'
  else if (site.pp === 0) sitePhrase = 'UD only in this slice'
  else if (ppShare >= 0.7) sitePhrase = `PP-heavy (${Math.round(ppShare * 100)}% of top cards)`
  else if (ppShare <= 0.3) sitePhrase = `UD-heavy (${Math.round((1 - ppShare) * 100)}% of top cards)`
  else sitePhrase = `balanced PP/UD (${site.pp} PP · ${site.ud} UD)`

  const topStruct = structureCounts[0]
  const structShare = topStruct ? topStruct[1] / n : 0
  let structPhrase: string
  if (topStruct && structShare >= 0.6) {
    structPhrase = `structure family is narrow (${topStruct[0]} on ${topStruct[1]}/${n} cards)`
  } else if (topStruct) {
    structPhrase = `structures are mixed (${topStruct[0]} most common)`
  } else {
    structPhrase = 'structure mix unclear'
  }

  const topStats = statCounts.slice(0, 2).map(([s]) => s)
  const statPhrase =
    topStats.length > 0
      ? `leg markets lean toward ${topStats.join(' and ')}`
      : 'stat coverage is thin (missing leg rows in lookup)'

  return `Visible opportunity is ${sitePhrase}; ${structPhrase}; ${statPhrase}.`
}

/** Aggregate over the same top-EV card slice as the opportunity surface. */
export function computeEdgeConcentrationFromCards(cards: Card[], legs: LegsLookup): EdgeConcentrationResult {
  if (!cards.length) {
    return {
      mode: 'empty',
      nCards: 0,
      site: { pp: 0, ud: 0 },
      structureCounts: [],
      statCounts: [],
      interpretation: buildInterpretation(0, { pp: 0, ud: 0 }, [], []),
    }
  }

  const site = { pp: 0, ud: 0 }
  const structMap = new Map<string, number>()
  const statMap = new Map<string, number>()

  for (const c of cards) {
    const su = String(c.site ?? '').toUpperCase()
    if (su === 'UD') site.ud++
    else site.pp++

    const sk = structureKey(c)
    structMap.set(sk, (structMap.get(sk) ?? 0) + 1)

    for (const id of getLegIdsFromCard(c)) {
      const row = legs.get(id)
      const raw = row?.stat?.toString().trim()
      if (!raw) continue
      const label = statLabel(raw)
      statMap.set(label, (statMap.get(label) ?? 0) + 1)
    }
  }

  const n = cards.length
  const structureCounts = sortCounts(structMap, 5)
  const statCounts = sortCounts(statMap, 6)

  return {
    mode: 'cards',
    nCards: n,
    site,
    structureCounts,
    statCounts,
    interpretation: buildInterpretation(n, site, structureCounts, statCounts),
  }
}

/** When there are no CSV cards, summarize viability near-miss flex types only (PP diagnostic). */
export function computeNearMissStructureConcentration(flexTypes: string[]): EdgeConcentrationResult {
  if (!flexTypes.length) {
    return {
      mode: 'empty',
      nCards: 0,
      site: { pp: 0, ud: 0 },
      structureCounts: [],
      statCounts: [],
      interpretation:
        'No near-miss structure rows in synced card EV viability JSON — sync reports after export.',
    }
  }

  const m = new Map<string, number>()
  for (const f of flexTypes) {
    const k = f.trim() || '?'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  const structureCounts = sortCounts(m, 5)
  const top = structureCounts[0]
  const maxShare = top ? top[1] / flexTypes.length : 0
  let interpretation: string
  if (top && maxShare >= 0.5) {
    interpretation = `Slate is narrow on viability samples: ${top[0]} dominates the near-miss list (${top[1]}/${flexTypes.length}).`
  } else if (structureCounts.length <= 2) {
    interpretation = `Near-miss samples are concentrated in a few structure families (${structureCounts.map(([s]) => s).join(', ')}).`
  } else {
    interpretation = `Near-miss viability samples are spread across several structures (${structureCounts
      .slice(0, 3)
      .map(([s]) => s)
      .join(', ')}, …).`
  }

  return {
    mode: 'near_miss_structures',
    nCards: 0,
    site: { pp: 0, ud: 0 },
    structureCounts,
    statCounts: [],
    interpretation,
  }
}
