import { useMemo, useState } from 'react'
import type { OperatorDecision } from '../lib/dashboardDecisionClarity'
import { deriveOperatorAction, type OperatorActionContext } from '../lib/operatorAction'
import { buildDashboardSnapshotText } from '../lib/dashboardSnapshotText'
import { copyPlainTextToClipboard, downloadPlainTextFile } from '../lib/dashboardSnapshotClipboard'

interface Props {
  fetchDone: boolean
  loadError: string | null
  runStatusPresent: boolean
  decision: OperatorDecision
  topCardCount: number
  hasNearMissStructures: boolean
  historicalRegistryPresent: boolean
  /** From latest_run_status — omitted in snapshot when missing */
  runTimestamp?: string | null
  /** First row of opportunity surface when PLAYABLE */
  snapshotTopCardLine?: string | null
  /** First near-miss structure line when NOT PLAYABLE */
  snapshotNearMissLine?: string | null
}

export default function OperatorActionPanel({
  fetchDone,
  loadError,
  runStatusPresent,
  decision,
  topCardCount,
  hasNearMissStructures,
  historicalRegistryPresent,
  runTimestamp,
  snapshotTopCardLine,
  snapshotNearMissLine,
}: Props) {
  const [snapshotFeedback, setSnapshotFeedback] = useState<string | null>(null)

  const action = useMemo(() => {
    const ctx: OperatorActionContext = {
      fetchDone,
      loadError,
      runStatusPresent,
      verdict: decision.verdict,
      primaryReason: decision.primaryReason,
      slateCode: decision.slate.code,
      topCardCount,
      hasNearMissStructures,
      viabilityHasFullRow: decision.viability.hasFullRow,
      viabilityGapNumeric: decision.viability.gapNumeric ?? null,
      historicalRegistryPresent,
    }
    return deriveOperatorAction(ctx)
  }, [
    fetchDone,
    loadError,
    runStatusPresent,
    decision,
    topCardCount,
    hasNearMissStructures,
    historicalRegistryPresent,
  ])

  const snapshotText = useMemo(() => {
    if (!fetchDone) return ''
    return buildDashboardSnapshotText({
      runTimestamp: runTimestamp ?? null,
      verdict: decision.verdict,
      reason: decision.primaryReason,
      slateLine: decision.slate.line,
      gapPct: decision.viability.hasFullRow ? (decision.viability.gapPct ?? null) : null,
      topCard: snapshotTopCardLine ?? null,
      topNearMiss: snapshotNearMissLine ?? null,
      actionPrimary: action.primary,
    })
  }, [
    fetchDone,
    runTimestamp,
    decision.verdict,
    decision.primaryReason,
    decision.slate.line,
    decision.viability.hasFullRow,
    decision.viability.gapPct,
    snapshotTopCardLine,
    snapshotNearMissLine,
    action.primary,
  ])

  return (
    <section
      className="p-3 rounded-lg border border-amber-900/50 bg-gradient-to-br from-amber-950/20 to-gray-950 text-xs"
      data-testid="operator-action-panel"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <div className="text-amber-200 font-semibold text-[13px]">Operator action cue</div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!fetchDone || !snapshotText}
            className="px-2 py-0.5 rounded border border-amber-800/60 bg-black/50 text-[11px] text-amber-100 hover:bg-amber-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="dashboard-copy-snapshot"
            onClick={async () => {
              const ok = await copyPlainTextToClipboard(snapshotText)
              if (!ok) downloadPlainTextFile('dfs-optimizer-snapshot.txt', snapshotText)
              setSnapshotFeedback(ok ? 'Copied' : 'Saved file')
              window.setTimeout(() => setSnapshotFeedback(null), 2000)
            }}
          >
            Copy snapshot
          </button>
          {snapshotFeedback && (
            <span className="text-[10px] text-emerald-400/90" data-testid="dashboard-snapshot-feedback">
              {snapshotFeedback}
            </span>
          )}
          <div className="text-[10px] text-gray-600">Phase 85 · rule {action.precedence}</div>
        </div>
      </div>

      <div className="text-base font-bold text-amber-100 tracking-tight mb-1" data-testid="operator-action-primary">
        {action.primary}
      </div>
      <p className="text-[11px] text-gray-300 leading-snug mb-2" data-testid="operator-action-why">
        {action.why}
      </p>
      {action.secondary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-amber-900/30 pt-2">
          {action.secondary.map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 rounded bg-black/40 border border-gray-700 text-[10px] text-gray-400"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
