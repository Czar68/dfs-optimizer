/**
 * Phase 82 — Pure presentation helpers: single verdict, primary reason, slate label, viability gap.
 * Uses only dashboard artifact shapes + CSV window hint; no math beyond comparing reported numbers.
 */
import type { RunStatusArtifact, PreDiversificationDiagnosisArtifact, CardEvViabilityArtifact } from './dashboardArtifacts'

export type VerdictLabel = 'PLAYABLE' | 'NOT PLAYABLE'

export type SlateStatusCode = 'ACTIVE' | 'OUTSIDE_WINDOW' | 'NEAR_LOCK' | 'NO_FUTURE_LEGS' | 'UNKNOWN'

/** Minutes — first future leg start within this window → NEAR_LOCK */
export const NEAR_LOCK_MINUTES = 45

export interface LegsWindowSnapshot {
  /** True after legs CSV fetch completed at least once */
  loaded: boolean
  ppNotStarted: number
  udNotStarted: number
  totalLegRows: number
  /** ms from now until earliest game time strictly in the future (across PP+UD CSV) */
  msUntilEarliestNotStarted?: number
}

export interface ViabilityGapDisplay {
  bestEvPct: string | null
  requiredPct: string | null
  gapPct: string | null
  /** Raw gap = best − required (same units as artifacts) */
  gapNumeric: number | null
  hasFullRow: boolean
}

export interface OperatorDecision {
  verdict: VerdictLabel
  /** Single dominant sentence for operators */
  primaryReason: string
  /** Secondary lines (not competing with primary) */
  detailLines: string[]
  slate: { code: SlateStatusCode; line: string }
  viability: ViabilityGapDisplay
}

function pct1(x: number | undefined | null): string | null {
  if (x == null || !Number.isFinite(x)) return null
  return `${(x * 100).toFixed(1)}%`
}

function humanizeSnake(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/_/g, ' ')
}

export function computeViabilityGap(ev: CardEvViabilityArtifact | null): ViabilityGapDisplay {
  const raw = ev?.globalRawEvMax
  const thr = ev?.sportCardEvThreshold
  if (raw == null || !Number.isFinite(raw) || thr == null || !Number.isFinite(thr)) {
    return {
      bestEvPct: raw != null && Number.isFinite(raw) ? pct1(raw) : null,
      requiredPct: thr != null && Number.isFinite(thr) ? pct1(thr) : null,
      gapPct: null,
      gapNumeric: null,
      hasFullRow: false,
    }
  }
  const gap = raw - thr
  return {
    bestEvPct: pct1(raw),
    requiredPct: pct1(thr),
    gapPct: pct1(gap),
    gapNumeric: gap,
    hasFullRow: true,
  }
}

export function computeSlateStatus(hint: LegsWindowSnapshot | null | undefined): {
  code: SlateStatusCode
  line: string
} {
  if (!hint || !hint.loaded) {
    return {
      code: 'UNKNOWN',
      line: 'Slate status: UNKNOWN (leg CSV snapshot not loaded yet).',
    }
  }
  const notStarted = hint.ppNotStarted + hint.udNotStarted
  if (hint.totalLegRows === 0) {
    return {
      code: 'NO_FUTURE_LEGS',
      line: 'Slate status: NO FUTURE LEGS (no rows in synced legs CSV).',
    }
  }
  if (notStarted === 0) {
    return {
      code: 'OUTSIDE_WINDOW',
      line:
        'Slate status: OUTSIDE WINDOW (no legs with game time in the future — started or missing times).',
    }
  }
  const nearMs = NEAR_LOCK_MINUTES * 60 * 1000
  const ms = hint.msUntilEarliestNotStarted
  if (ms != null && ms >= 0 && ms <= nearMs) {
    const mins = Math.max(0, Math.round(ms / 60000))
    return {
      code: 'NEAR_LOCK',
      line: `Slate status: NEAR LOCK (next future leg in ~${mins} min).`,
    }
  }
  return {
    code: 'ACTIVE',
    line: 'Slate status: ACTIVE (future legs remain on the board).',
  }
}

function shortStage(stage: string | undefined): string {
  if (!stage) return ''
  return stage.replace(/^pp:/, 'PP ').replace(/^ud:/, 'UD ').replace(/_/g, ' ')
}

/**
 * One primary reason sentence — precedence is documented for operator consistency.
 */
export function derivePrimaryReason(
  rs: RunStatusArtifact | null,
  pre: PreDiversificationDiagnosisArtifact | null,
  ev: CardEvViabilityArtifact | null
): string {
  const ppCards = Number(rs?.prizepicks?.cardsCount ?? 0)
  const udCards = Number(rs?.underdog?.cardsCount ?? 0)
  if (ppCards + udCards > 0) {
    return 'Playable: exported cards cleared thresholds on the last recorded pipeline run.'
  }

  if (rs?.outcome === 'fatal_exit' && rs.fatalReason) {
    return `No playable cards because the run ended fatally (${humanizeSnake(rs.fatalReason)}).`
  }
  if (rs?.outcome === 'early_exit' && rs.earlyExitReason) {
    return `No playable cards because the run exited early (${humanizeSnake(rs.earlyExitReason)}).`
  }

  const thr = ev?.sportCardEvThreshold
  const raw = ev?.globalRawEvMax
  if (
    ev &&
    thr != null &&
    Number.isFinite(thr) &&
    raw != null &&
    Number.isFinite(raw) &&
    raw < thr
  ) {
    return 'No playable cards because best sampled raw card EV is below the sport card EV export threshold.'
  }

  const dom = pre?.dominantDropStage ?? ''
  if (dom.includes('buildCardsForSize')) {
    return 'No playable cards because PP structure builds produced no candidates that passed EV gates.'
  }

  const udPre = pre?.ud
  if (
    udPre &&
    (udPre.cardsPostDedupe ?? 0) > 0 &&
    (udPre.cardsAfterSelectionEngine ?? 0) === 0 &&
    (udPre.selectionEngineBreakevenDropped ?? 0) > 0
  ) {
    return 'No playable cards because UD candidates that survived construction were eliminated at the selection / breakeven gate.'
  }

  if (pre?.rootCause === 'pp_builder_zero_accepted_candidates') {
    return 'No playable cards because the PP builder accepted zero candidates past sampling and EV gates.'
  }

  if (ev?.rootCauseClassification) {
    return `No playable cards primarily due to: ${humanizeSnake(ev.rootCauseClassification)}.`
  }

  return 'No playable cards on the last recorded run — see supporting detail and synced reports.'
}

/** Longer diagnostic lines (under the primary sentence) — artifact text only */
export function buildDiagnosticDetailLines(
  rs: RunStatusArtifact | null,
  pre: PreDiversificationDiagnosisArtifact | null,
  ev: CardEvViabilityArtifact | null
): string[] {
  const ppCards = Number(rs?.prizepicks?.cardsCount ?? 0)
  const udCards = Number(rs?.underdog?.cardsCount ?? 0)
  if (ppCards + udCards > 0) return []

  const lines: string[] = []
  if (pre?.dominantDropStage) {
    lines.push(`Dominant drop stage: ${shortStage(pre.dominantDropStage)}.`)
  }
  if (pre?.rootCause) {
    lines.push(`Diagnosis root cause code: ${pre.rootCause}.`)
  }
  const udBr = pre?.ud?.selectionEngineBreakevenDropped
  if (udBr != null && udBr > 0) {
    lines.push(`UD: ${udBr} card(s) dropped at selection / breakeven gate.`)
  }
  if (pre?.ud?.exampleBreakevenDropped && pre.ud.cardsAfterSelectionEngine === 0) {
    const ex = pre.ud.exampleBreakevenDropped
    lines.push(
      `UD example: avg leg prob ${pct1(ex.avgProb)} vs required ~${pct1(ex.requiredBreakeven)} for ${ex.format ?? 'structure'}.`
    )
  }
  if (ev?.rootCauseClassification) {
    lines.push(`Card EV viability classification: ${humanizeSnake(ev.rootCauseClassification)}.`)
  }
  if (ev?.globalRawEvMax != null && Number.isFinite(ev.globalRawEvMax)) {
    lines.push(
      `Best sampled raw card EV (PP): ${(ev.globalRawEvMax * 100).toFixed(2)}% (threshold ${pct1(ev.sportCardEvThreshold)}).`
    )
  }
  if (ev?.nextActionHint) lines.push(ev.nextActionHint)
  return lines
}

export function deriveOperatorDecision(
  rs: RunStatusArtifact | null,
  pre: PreDiversificationDiagnosisArtifact | null,
  ev: CardEvViabilityArtifact | null,
  legs: LegsWindowSnapshot | null | undefined
): OperatorDecision {
  const viability = computeViabilityGap(ev)
  const slate = computeSlateStatus(legs ?? null)

  if (rs == null) {
    return {
      verdict: 'NOT PLAYABLE',
      primaryReason:
        'Cannot confirm exported-card playability: latest_run_status.json is missing or not synced.',
      detailLines: buildDiagnosticDetailLines(rs, pre, ev),
      slate,
      viability,
    }
  }

  const ppCards = Number(rs.prizepicks?.cardsCount ?? 0)
  const udCards = Number(rs.underdog?.cardsCount ?? 0)
  const playable = ppCards + udCards > 0

  return {
    verdict: playable ? 'PLAYABLE' : 'NOT PLAYABLE',
    primaryReason: derivePrimaryReason(rs, pre, ev),
    detailLines: buildDiagnosticDetailLines(rs, pre, ev),
    slate,
    viability,
  }
}
