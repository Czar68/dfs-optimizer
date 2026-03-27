import type { Dispatch, MouseEvent, SetStateAction } from 'react'

type SortDir = 'asc' | 'desc'
type TopLegSortKey = 'edge' | 'legEv' | 'gameTime' | 'player' | 'stat' | 'ppBooks' | 'ppSpread'
type TopLegPpConsensusTriage = 'any' | 'tight_spread' | 'wide_spread' | 'many_books'

interface TopLegRow {
  id: string
  player: string
  stat: string
  line: string | number
  legEv: number
  edge: number
  site: 'PP' | 'UD'
  side: 'over' | 'under'
  team?: string
  gameTime?: string
  fairProb?: number
  breakevenProb?: number
  isNonStandardOdds?: boolean
  isGoblin?: boolean
  isDemon?: boolean
  eligibility: 'replacement_ready' | 'started_unusable'
  /** Phase P/R — PP legs only; missing before sync or non-PP rows. */
  ppNConsensusBooks?: number
  ppConsensusDevigSpreadOver?: number
}

interface TopLegsViewProps {
  topLegsNotStartedOnly: boolean
  setTopLegsNotStartedOnly: Dispatch<SetStateAction<boolean>>
  topLegsStatFilter: string
  setTopLegsStatFilter: Dispatch<SetStateAction<string>>
  topLegsGameFilter: string
  setTopLegsGameFilter: Dispatch<SetStateAction<string>>
  topLegsMinEdge: number
  setTopLegsMinEdge: Dispatch<SetStateAction<number>>
  topLegsPpConsensusTriage: TopLegPpConsensusTriage
  setTopLegsPpConsensusTriage: Dispatch<SetStateAction<TopLegPpConsensusTriage>>
  showGoblins: boolean
  setShowGoblins: Dispatch<SetStateAction<boolean>>
  showDemons: boolean
  setShowDemons: Dispatch<SetStateAction<boolean>>
  showNonStandard: boolean
  setShowNonStandard: Dispatch<SetStateAction<boolean>>
  topLegsSortKey: TopLegSortKey
  topLegsSortDir: SortDir
  setTopLegsSortKey: Dispatch<SetStateAction<TopLegSortKey>>
  setTopLegsSortDir: Dispatch<SetStateAction<SortDir>>
  topLegStats: { stats: string[]; games: string[] }
  topLegsPPFiltered: TopLegRow[]
  topLegsUDFiltered: TopLegRow[]
  copiedPlayerName: string
  copyPlayerName: (player: string, e?: MouseEvent) => void
  statAbbrev: (s: string) => string
  onCopyLegText: (text: string, e?: MouseEvent) => void
}

export default function TopLegsView(props: TopLegsViewProps) {
  const {
    topLegsNotStartedOnly, setTopLegsNotStartedOnly, topLegsStatFilter, setTopLegsStatFilter,
    topLegsGameFilter, setTopLegsGameFilter, topLegsMinEdge, setTopLegsMinEdge,
    topLegsPpConsensusTriage, setTopLegsPpConsensusTriage,
    showGoblins, setShowGoblins, showDemons, setShowDemons, showNonStandard, setShowNonStandard,
    topLegsSortKey, topLegsSortDir, setTopLegsSortKey, setTopLegsSortDir, topLegStats,
    topLegsPPFiltered, topLegsUDFiltered, copiedPlayerName, copyPlayerName, statAbbrev, onCopyLegText,
  } = props

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs bg-gray-900 border border-gray-800 rounded-lg p-2">
        <label className="flex items-center gap-1 text-gray-300">
          <input type="checkbox" checked={topLegsNotStartedOnly} onChange={e => setTopLegsNotStartedOnly(e.target.checked)} />
          Not-started only
        </label>
        <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={topLegsStatFilter} onChange={e => setTopLegsStatFilter(e.target.value)}>
          <option value="All">Stat: All</option>
          {topLegStats.stats.map(s => <option key={s} value={s}>{statAbbrev(s)}</option>)}
        </select>
        <select className="px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={topLegsGameFilter} onChange={e => setTopLegsGameFilter(e.target.value)}>
          <option value="All">Game: All</option>
          {topLegStats.games.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="text-gray-300">
          Min Edge %
          <input type="number" value={topLegsMinEdge} onChange={e => setTopLegsMinEdge(Number(e.target.value) || 0)} className="ml-1 w-16 px-1 py-0.5 bg-gray-800 border border-gray-700 rounded" />
        </label>
        <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={showGoblins} onChange={e => setShowGoblins(e.target.checked)} />Goblin</label>
        <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={showDemons} onChange={e => setShowDemons(e.target.checked)} />Demon</label>
        <label className="flex items-center gap-1 text-gray-300"><input type="checkbox" checked={showNonStandard} onChange={e => setShowNonStandard(e.target.checked)} />Nonstandard</label>
        <label className="flex items-center gap-1 text-cyan-200/90" title="PP legs only · UD table unchanged · rows without consensus data drop out when a preset is active (except Any)">
          <span className="text-gray-500">PP focus</span>
          <select
            className="px-2 py-1 bg-gray-800 border border-cyan-900/50 rounded text-gray-200 max-w-[13rem]"
            value={topLegsPpConsensusTriage}
            onChange={(e) => setTopLegsPpConsensusTriage(e.target.value as TopLegPpConsensusTriage)}
          >
            <option value="any">Any (no PP consensus filter)</option>
            <option value="tight_spread">Tight DV sprd O (≤ 0.015)</option>
            <option value="wide_spread">Wide DV sprd O (≥ 0.022)</option>
            <option value="many_books">Many books (≥ 3)</option>
          </select>
        </label>
        <select className="ml-auto px-2 py-1 bg-gray-800 border border-gray-700 rounded" value={`${topLegsSortKey}:${topLegsSortDir}`} onChange={e => {
          const [k, d] = e.target.value.split(':') as [TopLegSortKey, SortDir]
          setTopLegsSortKey(k); setTopLegsSortDir(d)
        }}>
          <option value="edge:desc">Sort Edge desc</option>
          <option value="edge:asc">Sort Edge asc</option>
          <option value="legEv:desc">Sort EV desc</option>
          <option value="legEv:asc">Sort EV asc</option>
          <option value="gameTime:asc">Sort Game asc</option>
          <option value="gameTime:desc">Sort Game desc</option>
          <option value="player:asc">Sort Player A-Z</option>
          <option value="player:desc">Sort Player Z-A</option>
          <option value="stat:asc">Sort Stat A-Z</option>
          <option value="stat:desc">Sort Stat Z-A</option>
          <option value="ppBooks:desc">Sort PP books desc</option>
          <option value="ppBooks:asc">Sort PP books asc</option>
          <option value="ppSpread:desc">Sort DV sprd O desc</option>
          <option value="ppSpread:asc">Sort DV sprd O asc</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {[{ site: 'PP' as const, rows: topLegsPPFiltered }, { site: 'UD' as const, rows: topLegsUDFiltered }].map(({ site, rows }) => (
          <div key={site} className="dfs-table-wrapper rounded-lg border border-gray-800 overflow-x-auto overflow-y-auto max-h-[70vh] p-0">
            <div className={`px-3 py-2 text-xs font-semibold border-b border-gray-800 ${site === 'PP' ? 'text-blue-300' : 'text-orange-300'}`}>{site} Top Legs ({rows.length})</div>
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-black text-gray-400 z-10">
                <tr>
                  <th className="px-2 py-1 text-left">Player</th>
                  <th className="px-2 py-1 text-left">Stat</th>
                  <th className="px-2 py-1 text-left">Side/Line</th>
                  <th className="px-2 py-1 text-right">Edge%</th>
                  <th className="px-2 py-1 text-right">EV%</th>
                  <th className="px-2 py-1 text-right">Fair%</th>
                  <th className="px-2 py-1 text-right">BE%</th>
                  {site === 'PP' && (
                    <>
                      <th
                        className="px-2 py-1 text-right text-[11px] font-medium text-cyan-200/90"
                        title="ppNConsensusBooks — number of books in the PP sharp-weighted consensus for this leg"
                      >
                        PP books
                      </th>
                      <th
                        className="px-2 py-1 text-right text-[11px] font-medium text-cyan-200/90"
                        title="ppConsensusDevigSpreadOver — cross-book de-vig probability spread on the over side (tight ≈ clustered books)"
                      >
                        DV sprd O
                      </th>
                    </>
                  )}
                  <th className="px-2 py-1 text-left">Game</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {rows.map((leg) => {
                  const tags = [leg.isGoblin ? 'G' : '', leg.isDemon ? 'D' : '', leg.isNonStandardOdds ? 'NS' : ''].filter(Boolean).join(' ')
                  const compactLeg = `${leg.player} ${statAbbrev(leg.stat)} ${leg.side === 'under' ? 'u' : 'o'}${leg.line}`
                  return (
                    <tr key={leg.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-2 py-1">
                        <button type="button" className={`underline decoration-dotted ${copiedPlayerName === leg.player ? 'text-green-300' : 'text-cyan-300 hover:text-cyan-200'}`} onClick={(e) => copyPlayerName(leg.player, e)}>{leg.player}</button>
                      </td>
                      <td className="px-2 py-1">{statAbbrev(leg.stat)}</td>
                      <td className="px-2 py-1">
                        <span className="font-medium">{leg.side === 'under' ? 'Under' : 'Over'} {leg.line}</span>
                        {tags && <span className="ml-1 text-[10px] text-amber-300">[{tags}]</span>}
                      </td>
                      <td className="px-2 py-1 text-right">{(leg.edge * 100).toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{(leg.legEv * 100).toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{leg.fairProb != null ? (leg.fairProb * 100).toFixed(2) : '—'}</td>
                      <td className="px-2 py-1 text-right">{leg.breakevenProb != null ? (leg.breakevenProb * 100).toFixed(2) : '—'}</td>
                      {site === 'PP' && (
                        <>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {leg.ppNConsensusBooks != null ? leg.ppNConsensusBooks : '—'}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-[11px] tabular-nums">
                            {leg.ppConsensusDevigSpreadOver != null
                              ? leg.ppConsensusDevigSpreadOver.toFixed(4)
                              : '—'}
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1 text-xs">{leg.team ?? 'TBD'} {leg.gameTime ? `· ${new Date(leg.gameTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</td>
                      <td className="px-2 py-1 text-xs">
                        {leg.eligibility === 'replacement_ready'
                          ? <span className="text-emerald-300">replacement-ready</span>
                          : <span className="text-red-300">started/unusable</span>}
                      </td>
                      <td className="px-2 py-1 text-xs">
                        <button type="button" className="text-gray-300 hover:text-white underline decoration-dotted" onClick={(e) => onCopyLegText(compactLeg, e)}>
                          copy leg
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
