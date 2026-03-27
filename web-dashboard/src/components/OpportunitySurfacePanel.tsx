import { useMemo } from 'react'
import type { CardEvViabilityArtifact } from '../lib/dashboardArtifacts'
import { topNearMissStructures } from '../lib/opportunitySurface'
import type { VerdictLabel } from '../lib/dashboardDecisionClarity'

export interface OpportunityTopCardRow {
  flexType: string
  cardEv: number
  site: string
  summaryLine: string
}

const LIMIT = 5

interface Props {
  fetchDone: boolean
  verdict: VerdictLabel
  playableTopCards: OpportunityTopCardRow[]
  viabilityArtifact: CardEvViabilityArtifact | null
}

export default function OpportunitySurfacePanel({
  fetchDone,
  verdict,
  playableTopCards,
  viabilityArtifact,
}: Props) {
  const nearMisses = useMemo(
    () => topNearMissStructures(viabilityArtifact, LIMIT),
    [viabilityArtifact]
  )

  return (
    <section
      className="p-3 rounded-lg border border-violet-900/40 bg-gray-950/80 text-xs"
      data-testid="opportunity-surface-panel"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-violet-300 font-semibold text-[13px]">Opportunity surface</div>
        <div className="text-[10px] text-gray-600">Real outputs only</div>
      </div>

      {!fetchDone && <div className="text-gray-500 py-2">Loading…</div>}

      {fetchDone && verdict === 'PLAYABLE' && (
        <>
          <div className="text-[11px] text-gray-400 mb-2">Top cards by EV (synced CSV)</div>
          {playableTopCards.length === 0 ? (
            <div className="text-amber-200/90 border border-amber-900/30 rounded p-2 bg-amber-950/20">
              No exported cards in the current dashboard CSV snapshot. Refresh or redeploy data if the pipeline
              wrote cards but this view is empty.
            </div>
          ) : (
            <ul className="space-y-2">
              {playableTopCards.slice(0, LIMIT).map((row, i) => (
                <li
                  key={`${row.site}-${row.flexType}-${i}`}
                  className="border border-gray-800 rounded p-2 bg-black/30"
                >
                  <div className="flex flex-wrap justify-between gap-1 text-[11px]">
                    <span className="text-gray-200 font-medium">
                      {row.site} · {row.flexType}
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      EV {(row.cardEv * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 leading-snug line-clamp-2" title={row.summaryLine}>
                    {row.summaryLine}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {fetchDone && verdict === 'NOT PLAYABLE' && (
        <>
          <div className="text-[11px] text-gray-400 mb-2">
            Closest to viable (PP structure samples from card EV viability export)
          </div>
          {nearMisses.length === 0 ? (
            <div className="text-amber-200/90 border border-amber-900/30 rounded p-2 bg-amber-950/20">
              No candidate structure rows available — sync{' '}
              <code className="text-gray-400">latest_card_ev_viability.json</code> after{' '}
              <code className="text-gray-400">npm run export:card-ev-viability</code>.
            </div>
          ) : (
            <ul className="space-y-2">
              {nearMisses.map((row) => (
                <li key={row.flexType} className="border border-gray-800 rounded p-2 bg-black/30">
                  <div className="flex flex-wrap justify-between gap-1 text-[11px]">
                    <span className="text-gray-200 font-medium">PP · {row.flexType}</span>
                    <span className="text-orange-300/90">Gap {row.gapPct}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] text-gray-400">
                    <span>EV {row.evPct}</span>
                    <span>Req {row.thresholdPct}</span>
                    <span className="text-right text-gray-500">sampled best</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-gray-600 mt-2 leading-snug">
            Rows use greedy best-case raw EV per structure from the viability report (not individual exported
            cards). UD near-miss is not in this artifact.
          </p>
        </>
      )}
    </section>
  )
}
