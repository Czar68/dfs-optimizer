import type { TabId } from '../config/tabs'

const TAB_IDS: TabId[] = [
  'must_play',
  'strong',
  'all',
  'lottery',
  'top_legs_pp',
  'top_legs_ud',
  'tracker',
]

const SORT_KEYS = new Set([
  'edge',
  'legEv',
  'gameTime',
  'player',
  'stat',
  'ppBooks',
  'ppSpread',
])

const SORT_DIRS = new Set(['asc', 'desc'])

const PP_FOCUS = new Set(['any', 'tight_spread', 'wide_spread', 'many_books'])

export type ExploreLegSortKey =
  | 'edge'
  | 'legEv'
  | 'gameTime'
  | 'player'
  | 'stat'
  | 'ppBooks'
  | 'ppSpread'
export type ExploreSortDir = 'asc' | 'desc'
export type ExplorePpFocus = 'any' | 'tight_spread' | 'wide_spread' | 'many_books'

export interface ExploreUrlParsed {
  tab?: TabId
  legsTop?: 25 | 50 | 100
  legsSortKey?: ExploreLegSortKey
  legsSortDir?: ExploreSortDir
  ppFocus?: ExplorePpFocus
  legsStat?: string
  legsGame?: string
}

export function parseExploreUrl(search: string): ExploreUrlParsed {
  const sp = new URLSearchParams(search)
  const out: ExploreUrlParsed = {}

  const tab = sp.get('tab')
  if (tab && (TAB_IDS as readonly string[]).includes(tab)) {
    out.tab = tab as TabId
  }

  const legsTop = sp.get('legsTop')
  if (legsTop === '25' || legsTop === '50' || legsTop === '100') {
    out.legsTop = Number(legsTop) as 25 | 50 | 100
  }

  const legsSort = sp.get('legsSort')
  if (legsSort) {
    const [k, d] = legsSort.split(':')
    if (k && d && SORT_KEYS.has(k) && SORT_DIRS.has(d)) {
      out.legsSortKey = k as ExploreLegSortKey
      out.legsSortDir = d as ExploreSortDir
    }
  }

  const ppF = sp.get('ppFocus')
  if (ppF && PP_FOCUS.has(ppF)) {
    out.ppFocus = ppF as ExplorePpFocus
  }

  const legsStat = sp.get('legsStat')
  if (legsStat != null && legsStat.trim().length > 0) {
    out.legsStat = legsStat
  }

  const legsGame = sp.get('legsGame')
  if (legsGame != null && legsGame.trim().length > 0) {
    out.legsGame = legsGame
  }

  return out
}

const EXPLORE_KEYS = ['tab', 'legsTop', 'legsSort', 'ppFocus', 'legsStat', 'legsGame'] as const

export function stripExploreKeys(searchParams: URLSearchParams): void {
  for (const k of EXPLORE_KEYS) searchParams.delete(k)
}

function setOrDelete(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  defaultValue: string
): void {
  if (value === defaultValue) searchParams.delete(key)
  else searchParams.set(key, value)
}

export function syncExploreKeys(
  searchParams: URLSearchParams,
  input: {
    tab: TabId
    topLegsLimit: 25 | 50 | 100
    topLegsSortKey: string
    topLegsSortDir: ExploreSortDir
    topLegsPpConsensusTriage: ExplorePpFocus
    topLegsStatFilter: string
    topLegsGameFilter: string
  }
): void {
  setOrDelete(searchParams, 'tab', input.tab, 'must_play')

  const isTopLegs = input.tab === 'top_legs_pp' || input.tab === 'top_legs_ud'
  if (!isTopLegs) {
    searchParams.delete('legsTop')
    searchParams.delete('legsSort')
    searchParams.delete('ppFocus')
    searchParams.delete('legsStat')
    searchParams.delete('legsGame')
    return
  }

  setOrDelete(searchParams, 'legsTop', String(input.topLegsLimit), '50')

  const sortStr = `${input.topLegsSortKey}:${input.topLegsSortDir}`
  setOrDelete(searchParams, 'legsSort', sortStr, 'edge:desc')

  setOrDelete(searchParams, 'ppFocus', input.topLegsPpConsensusTriage, 'any')

  if (input.topLegsStatFilter === 'All') searchParams.delete('legsStat')
  else searchParams.set('legsStat', input.topLegsStatFilter)

  if (input.topLegsGameFilter === 'All') searchParams.delete('legsGame')
  else searchParams.set('legsGame', input.topLegsGameFilter)
}
