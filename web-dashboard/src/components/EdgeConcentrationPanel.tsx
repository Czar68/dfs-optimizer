import { useMemo } from 'react'
import type { Card, LegsLookup } from '../types'
import type { VerdictLabel } from '../lib/dashboardDecisionClarity'
import {
  computeEdgeConcentrationFromCards,
  computeNearMissStructureConcentration,
} from '../lib/edgeConcentration'

interface Props {
  verdict: VerdictLabel
  /** Same top-EV slice as opportunity surface (max 5) */
  concentrationCards: Card[]
  legs: LegsLookup
  /** From card EV viability near-miss (PP); used when card slice is empty */
  nearMissFlexTypes: string[]
}

export default function EdgeConcentrationPanel({
  verdict,
  concentrationCards,
  legs,
  nearMissFlexTypes,
}: Props) {
  const model = useMemo(() => {
    if (concentrationCards.length > 0) {
      return computeEdgeConcentrationFromCards(concentrationCards, legs)
    }
    if (verdict === 'NOT PLAYABLE' && nearMissFlexTypes.length > 0) {
      return computeNearMissStructureConcentration(nearMissFlexTypes)
    }
    return computeEdgeConcentrationFromCards([], legs)
  }, [concentrationCards, legs, verdict, nearMissFlexTypes])

  const siteTotal = model.site.pp + model.site.ud
  const ppPct = siteTotal > 0 ? Math.round((100 * model.site.pp) / siteTotal) : 0
  const udPct = siteTotal > 0 ? 100 - ppPct : 0

  return (
    <section
      className="p-3 rounded-lg border border-teal-900/45 bg-gray-950/80 text-xs"
      data-testid="edge-concentration-panel"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-teal-300 font-semibold text-[13px]">Edge concentration</div>
        <div className="text-[10px] text-gray-600">
          {model.mode === 'cards'
            ? `Top ${model.nCards} by EV (CSV)`
            : model.mode === 'near_miss_structures'
              ? 'Near-miss structures (viability)'
              : '—'}
        </div>
      </div>

      {model.mode === 'empty' && (
        <p className="text-amber-200/90 text-[11px] border border-amber-900/30 rounded p-2 bg-amber-950/20">
          {model.interpretation}
        </p>
      )}

      {model.mode !== 'empty' && (
        <>
          {model.mode === 'cards' && (
            <>
              <div className="mb-2">
                <div className="text-[10px] text-gray-500 uppercase mb-1">Site</div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-900/40 text-cyan-200">
                    PP {model.site.pp} ({ppPct}%)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-violet-950/50 border border-violet-900/40 text-violet-200">
                    UD {model.site.ud} ({udPct}%)
                  </span>
                </div>
              </div>

              <div className="mb-2">
                <div className="text-[10px] text-gray-500 uppercase mb-1">Structures</div>
                <div className="flex flex-wrap gap-1">
                  {model.structureCounts.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    model.structureCounts.map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-gray-800/80 border border-gray-700 text-gray-300"
                      >
                        {k} ×{v}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="mb-2">
                <div className="text-[10px] text-gray-500 uppercase mb-1">Markets (legs)</div>
                <div className="flex flex-wrap gap-1">
                  {model.statCounts.length === 0 ? (
                    <span className="text-gray-500">No leg stat rows resolved (check legs CSV sync).</span>
                  ) : (
                    model.statCounts.map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-gray-800/80 border border-gray-700 text-gray-300"
                      >
                        {k} ×{v}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {model.mode === 'near_miss_structures' && (
            <div className="mb-2">
              <div className="text-[10px] text-gray-500 uppercase mb-1">Structures (viability sample)</div>
              <div className="flex flex-wrap gap-1">
                {model.structureCounts.map(([k, v]) => (
                  <span
                    key={k}
                    className="px-2 py-0.5 rounded bg-gray-800/80 border border-gray-700 text-gray-300"
                  >
                    {k} ×{v}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">PP diagnostic only — no site/stat split in this artifact.</p>
            </div>
          )}

          <p className="text-[11px] text-gray-200 leading-snug border-t border-gray-800 pt-2 mt-1">
            {model.interpretation}
          </p>
        </>
      )}
    </section>
  )
}
