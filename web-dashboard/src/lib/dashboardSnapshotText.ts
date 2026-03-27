/**
 * Phase 86 — Plain-text snapshot from existing dashboard-derived fields only (no new analytics).
 */
export interface DashboardSnapshotFields {
  runTimestamp?: string | null
  verdict: string
  reason: string
  slateLine: string
  /** Included only when viability gap row is present in UI */
  gapPct?: string | null
  topCard?: string | null
  topNearMiss?: string | null
  actionPrimary: string
}

function pushIfNonEmpty(lines: string[], label: string, value: string | null | undefined): void {
  const v = value?.trim()
  if (v) lines.push(`${label}: ${v}`)
}

export function buildDashboardSnapshotText(f: DashboardSnapshotFields): string {
  const lines: string[] = ['DFS Optimizer Snapshot']
  pushIfNonEmpty(lines, 'Run', f.runTimestamp ?? null)
  lines.push(`Verdict: ${f.verdict}`)
  lines.push(`Reason: ${f.reason}`)
  lines.push(`Slate: ${f.slateLine}`)
  pushIfNonEmpty(lines, 'Gap', f.gapPct ?? null)
  pushIfNonEmpty(lines, 'Top Card', f.topCard ?? null)
  pushIfNonEmpty(lines, 'Top Near Miss', f.topNearMiss ?? null)
  lines.push(`Action: ${f.actionPrimary}`)
  return lines.join('\n')
}
