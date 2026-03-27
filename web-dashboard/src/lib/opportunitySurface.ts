/**
 * Phase 83 — Derive “closest to viable” rows from existing card EV viability JSON only (no EV recomputation).
 */
import type { CardEvViabilityArtifact } from './dashboardArtifacts'

export interface NearMissStructureRow {
  flexType: string
  evPct: string
  thresholdPct: string
  gapPct: string
  /** gap = bestCaseRawEvIid − sportCardEvThreshold (artifact fields) */
  gap: number
}

/** Sort by descending gap — closest to clearing threshold first (largest gap, i.e. least negative when below threshold). */
export function topNearMissStructures(
  ev: CardEvViabilityArtifact | null,
  limit: number
): NearMissStructureRow[] {
  const structs = ev?.structures
  if (!structs?.length) return []
  const rows: NearMissStructureRow[] = []
  for (const s of structs) {
    const raw = s.bestCaseRawEvIid
    const thr = s.sportCardEvThreshold
    if (raw == null || thr == null || !Number.isFinite(raw) || !Number.isFinite(thr)) continue
    const gap = raw - thr
    rows.push({
      flexType: (s.flexType ?? `${s.size ?? '?'}L`).toString(),
      evPct: `${(raw * 100).toFixed(2)}%`,
      thresholdPct: `${(thr * 100).toFixed(2)}%`,
      gapPct: `${(gap * 100).toFixed(2)}%`,
      gap,
    })
  }
  rows.sort((a, b) => b.gap - a.gap)
  return rows.slice(0, Math.max(0, limit))
}
