import type { Card } from '../types'
import { getLegIds } from '../lib/optimizerCsvCards'
import type { LastFreshRunManifest } from '../lib/optimizerCsvCards'

/** If last run is older than this, show an explicit stale warning (display-only). */
export const STALE_RUN_MS = 36 * 60 * 60 * 1000

export function siteLabel(site: string): string {
  if (site === 'PP') return 'PrizePicks'
  if (site === 'UD') return 'Underdog'
  return site || '—'
}

export function slipSummary(c: Card): string {
  const n = getLegIds(c).length
  return `${c.sport ?? '—'} · ${n}-leg · ${siteLabel(c.site)} · ${c.flexType ?? '—'}`
}

export function bestLegPreview(c: Card): string {
  const line = c.playerPropLine?.trim()
  if (!line) return '—'
  const first = line.split('|')[0]?.trim() ?? line
  return first.length > 72 ? `${first.slice(0, 69)}…` : first
}

export function formatWinRateVsBe(c: Card): string {
  const bg = (c as Card & { breakevenGap?: number }).breakevenGap
  if (typeof bg === 'number' && Number.isFinite(bg)) {
    return `${(bg * 100).toFixed(1)} pts vs BE`
  }
  const wp = c.winProbCash
  if (typeof wp === 'number' && Number.isFinite(wp)) {
    return `${(wp * 100).toFixed(1)}% cash win`
  }
  return '—'
}

export function parlayStrengthCell(c: Card): string {
  const parts: string[] = []
  if (c.bestBetTier) parts.push(c.bestBetTier.replace(/_/g, ' '))
  if (c.bestBetScore != null && Number.isFinite(c.bestBetScore)) {
    parts.push(`score ${c.bestBetScore.toFixed(4)}`)
  }
  if (c.cardEv != null && Number.isFinite(c.cardEv)) {
    parts.push(`${(c.cardEv * 100).toFixed(1)}% EV`)
  }
  if (c.avgEdgePct != null && Number.isFinite(c.avgEdgePct)) {
    parts.push(`avg edge ${c.avgEdgePct.toFixed(1)}%`)
  }
  return parts.length ? parts.join(' · ') : '—'
}

export function relativeAgo(iso: string): string | null {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export function runFreshnessLine(
  m: LastFreshRunManifest | null,
  manifestError: string | null,
  loading: boolean
): string {
  if (loading) return 'Loading run metadata…'
  if (manifestError) {
    return `Last optimizer run time unavailable (${manifestError}). CSV rows below may not match any recorded run.`
  }
  const raw = m?.fresh_run_completed_at?.trim()
  if (!raw) return 'Last optimizer run time missing from data/last_fresh_run.json.'
  const t = new Date(raw).getTime()
  if (!Number.isFinite(t)) return 'Last optimizer run timestamp in manifest could not be parsed.'
  const rel = relativeAgo(raw)
  return `Last optimizer run: ${raw}${rel ? ` (${rel})` : ''}`
}

export function isRunStale(m: LastFreshRunManifest | null): boolean {
  const raw = m?.fresh_run_completed_at?.trim()
  if (!raw) return false
  const t = new Date(raw).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t > STALE_RUN_MS
}

const PP_BOARD = 'https://app.prizepicks.com/projections/nba'
const UD_BOARD = 'https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA'

export function deepLinkFor(c: Card): { href: string; label: string } {
  if (c.site === 'UD') {
    const ids = getLegIds(c)
    const href =
      ids.length > 0
        ? `https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA?legs=${ids.map(encodeURIComponent).join(',')}`
        : UD_BOARD
    return { href, label: 'Open Underdog' }
  }
  return { href: PP_BOARD, label: 'Open PrizePicks' }
}
