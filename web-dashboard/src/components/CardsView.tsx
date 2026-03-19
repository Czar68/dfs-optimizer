import { Fragment, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import type { Card, LegInfo, LegsLookup } from '../types'

type SortDir = 'asc' | 'desc'
type CardSortKey = 'edge' | 'ev' | 'gameTime' | 'player' | 'cardType'

interface PortfolioLike {
  displayedStake: (card: Card, kellyStake: number) => number
}

interface CardsViewProps {
  tier1CountInView: number
  cardTypeFilter: string
  setCardTypeFilter: Dispatch<SetStateAction<string>>
  cardGameFilter: string
  setCardGameFilter: Dispatch<SetStateAction<string>>
  cardMinEdge: number
  setCardMinEdge: Dispatch<SetStateAction<number>>
  cardSortKey: CardSortKey
  cardSortDir: SortDir
  setCardSortKey: Dispatch<SetStateAction<CardSortKey>>
  setCardSortDir: Dispatch<SetStateAction<SortDir>>
  cardFilterOptions: { types: string[]; games: string[] }
  filteredCards: Card[]
  expandedCard: number | null
  setExpandedCard: Dispatch<SetStateAction<number | null>>
  copiedPlayerName: string
  copyPlayerName: (player: string, e?: MouseEvent) => void
  copyLeg: (leg: LegInfo, e?: MouseEvent) => void
  copyParlay: (card: Card, e?: MouseEvent) => void
  portfolio: PortfolioLike
  resolvePlayerPropLine: (card: Card, legs: LegsLookup) => string
  getLegIds: (card: Card) => string[]
  primaryPlayerName: (card: Card, legs: LegsLookup) => string
  cardStartMs: (card: Card, legs: LegsLookup) => number
  cardEligibility: (card: Card, legs: LegsLookup) => 'replacement_ready' | 'started_unusable'
  cardTypeLabel: (card: Card) => string
  cardKey: (card: Card) => string
  statAbbrev: (s: string) => string
  TIER_STYLE: Record<string, string>
  TIER_LABEL: Record<string, string>
  TIER_PRIORITY_LABEL: Record<string, string>
  legs: LegsLookup
}

export default function CardsView(props: CardsViewProps) {
  const {
    tier1CountInView, cardTypeFilter, setCardTypeFilter, cardGameFilter, setCardGameFilter,
    cardMinEdge, setCardMinEdge, cardSortKey, cardSortDir, setCardSortKey, setCardSortDir,
    cardFilterOptions, filteredCards, expandedCard, setExpandedCard, copiedPlayerName,
    copyPlayerName, copyLeg, copyParlay, portfolio, resolvePlayerPropLine, getLegIds,
    primaryPlayerName, cardStartMs, cardEligibility, cardTypeLabel, cardKey, statAbbrev,
    TIER_STYLE, TIER_LABEL, TIER_PRIORITY_LABEL, legs,
  } = props

  return (
    <div className="space-y-3">
      {tier1CountInView === 0 && (
        <div className="text-xs px-3 py-2 rounded border border-amber-700/40 bg-amber-900/15 text-amber-200">
          No Tier 1 cards in current view. Consider reducing filters or treating this slate as lower-conviction.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs bg-gray-900 border border-gray-800 rounded-lg p-2">
        <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={cardTypeFilter} onChange={e => setCardTypeFilter(e.target.value)}>
          <option value="All">Card type: All</option>
          {cardFilterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={cardGameFilter} onChange={e => setCardGameFilter(e.target.value)}>
          <option value="All">Game time: All</option>
          {cardFilterOptions.games.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="text-gray-300">
          Min Edge %
          <input type="number" value={cardMinEdge} onChange={e => setCardMinEdge(Number(e.target.value) || 0)} className="ml-1 w-16 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded" />
        </label>
        <select className="ml-auto px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={`${cardSortKey}:${cardSortDir}`} onChange={e => {
          const [k, d] = e.target.value.split(':') as [CardSortKey, SortDir]
          setCardSortKey(k); setCardSortDir(d)
        }}>
          <option value="ev:desc">Sort EV desc</option>
          <option value="ev:asc">Sort EV asc</option>
          <option value="edge:desc">Sort Edge desc</option>
          <option value="edge:asc">Sort Edge asc</option>
          <option value="gameTime:asc">Sort Game asc</option>
          <option value="gameTime:desc">Sort Game desc</option>
          <option value="player:asc">Sort Player A-Z</option>
          <option value="player:desc">Sort Player Z-A</option>
          <option value="cardType:asc">Sort Type A-Z</option>
          <option value="cardType:desc">Sort Type Z-A</option>
        </select>
      </div>

      <div className="dfs-table-wrapper rounded-lg border border-gray-800">
        <table className="dfs-table">
          <colgroup>
            <col className="col-expand" />
            <col className="col-site" />
            <col className="col-player" />
            <col className="col-tier" />
            <col className="col-tier" />
            <col className="col-score" />
            <col className="col-ev" />
            <col className="col-win" />
            <col className="col-edge" />
            <col className="col-kelly" />
          </colgroup>
          <thead>
            <tr>
              <th className="col-expand text-center">▼</th>
              <th className="col-site">Provider</th>
              <th className="col-player">Players / Legs</th>
              <th className="col-tier">Type</th>
              <th className="col-tier">Tier</th>
              <th className="col-score">Score</th>
              <th className="col-ev">EV</th>
              <th className="col-win">Win%</th>
              <th className="col-edge">Edge</th>
              <th className="col-kelly">Kelly</th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No cards in this tab. Try "All Cards" or change filters.</td></tr>
            )}
            {filteredCards.slice(0, 50).map((card, i) => {
              const isExpanded = expandedCard === i
              const ppl = resolvePlayerPropLine(card, legs)
              const cardLegs = getLegIds(card).map(id => legs.get(id)).filter((x): x is LegInfo => !!x)
              const edgePct = Number(card.avgEdgePct) <= 1 ? Number(card.avgEdgePct) * 100 : Number(card.avgEdgePct)
              const winPct = card.winProbCash ? (Number(card.winProbCash) * 100).toFixed(1) : '—'
              const score = Number(card.bestBetScore) ?? 0
              const tier = card.bestBetTier || 'skip'
              const tierStyle = TIER_STYLE[tier] || TIER_STYLE.skip
              const tierLbl = card.bestBetTierLabel || TIER_LABEL[tier] || tier
              const tierPriority = TIER_PRIORITY_LABEL[tier] || 'Tier ?'
              const displayedStake = portfolio.displayedStake(card, card.kellyStake)
              const siteLeg = card.siteLeg ?? `${String(card.site).toLowerCase()}-${card.flexType?.toLowerCase()}`
              const mainPlayer = primaryPlayerName(card, legs)
              const lineWithoutLeadPlayer = (mainPlayer && ppl.startsWith(mainPlayer))
                ? ppl.slice(mainPlayer.length).trimStart()
                : ppl
              const startMs = cardStartMs(card, legs)
              const eligibility = cardEligibility(card, legs)
              const startLabel = Number.isFinite(startMs) ? new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'
              return (
                <Fragment key={`card-${i}`}>
                  <tr
                    className={`transition-colors cursor-pointer ${isExpanded ? 'bg-gray-800/60' : 'hover:bg-gray-800/30'} ${tier === 'must_play' ? 'bg-emerald-950/20' : ''}`}
                    onClick={() => setExpandedCard(isExpanded ? null : i)}
                  >
                    <td className="col-expand text-center align-middle">{isExpanded ? '▲' : '▼'}</td>
                    <td className="col-site whitespace-nowrap">
                      <span className={`font-medium ${card.site === 'PP' ? 'text-blue-400' : 'text-orange-400'}`}>{siteLeg}</span>
                      <div className="text-[10px] text-gray-500">{startLabel}</div>
                    </td>
                    <td className="col-player text-gray-200" title={ppl}>
                      {mainPlayer && (
                        <button
                          type="button"
                          className={`mr-1 underline decoration-dotted ${copiedPlayerName === mainPlayer ? 'text-green-300' : 'text-cyan-300 hover:text-cyan-200'}`}
                          onClick={(e) => copyPlayerName(mainPlayer, e)}
                        >
                          {mainPlayer}
                        </button>
                      )}
                      <span>{lineWithoutLeadPlayer}</span>
                      <div className="text-[10px] text-gray-500">{eligibility === 'replacement_ready' ? 'replacement-ready' : 'started/unusable'}</div>
                    </td>
                    <td className="col-tier text-center">{cardTypeLabel(card)}</td>
                    <td className="col-tier">
                      <div className={`tier-badge ${tierStyle}`}>{tierLbl}</div>
                      <div className={`text-[10px] ${tier === 'must_play' ? 'text-emerald-300 font-medium' : 'text-gray-500'}`}>{tierPriority}</div>
                    </td>
                    <td className="col-score font-mono text-right">{score.toFixed(0)}</td>
                    <td className="col-ev text-right font-bold text-green-300">{(Number(card.cardEv) * 100).toFixed(1)}%</td>
                    <td className="col-win text-right text-gray-300">{winPct}%</td>
                    <td className="col-edge text-right font-semibold text-gray-200">{edgePct.toFixed(1)}%</td>
                    <td className="col-kelly text-right font-bold text-white">${displayedStake.toFixed(2)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-900/50">
                      <td colSpan={10} className="px-3 py-2">
                        <div className="text-[11px] text-gray-300 space-y-1">
                          {cardLegs.length === 0 && <div className="text-gray-500">No leg rows available.</div>}
                          {cardLegs.map((leg, li) => (
                            <div key={`${cardKey(card)}-${leg.id}-${li}`} className="flex items-center gap-2 border border-gray-800 rounded px-2 py-1">
                              <span className="text-gray-500 w-5">{li + 1}.</span>
                              <button type="button" className={`underline decoration-dotted ${copiedPlayerName === leg.player ? 'text-green-300' : 'text-cyan-300 hover:text-cyan-200'}`} onClick={(e) => copyPlayerName(leg.player, e)}>
                                {leg.player}
                              </button>
                              <span className="text-gray-300">{statAbbrev(leg.stat)} o{leg.line}</span>
                              <span className="text-gray-500 ml-auto">{leg.gameTime ? new Date(leg.gameTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}</span>
                              <button type="button" className="text-gray-400 hover:text-white underline decoration-dotted" onClick={(e) => copyLeg(leg, e)}>copy leg</button>
                            </div>
                          ))}
                          <div className="pt-1">
                            <button type="button" className="text-gray-300 hover:text-white underline decoration-dotted" onClick={(e) => copyParlay(card, e)}>copy card text</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
