/**
 * Phase 85 — Deterministic operator action precedence from existing dashboard state only.
 *
 * Precedence (first match wins):
 * 1. Missing critical reports / sync required
 * 2. PLAYABLE with top-card rows in CSV (or PLAYABLE with empty slice → reconcile CSV)
 * 3. Slate outside window or no future legs
 * 4. Near lock but not playable
 * 5. Not playable but near-miss viability structures exist
 * 6. Not playable with full viability row and negative gap
 * 7. Fallback (ambiguous — review diagnostics)
 */
import type { VerdictLabel, SlateStatusCode } from './dashboardDecisionClarity'

export interface OperatorActionContext {
  fetchDone: boolean
  loadError: string | null
  runStatusPresent: boolean
  verdict: VerdictLabel
  primaryReason: string
  slateCode: SlateStatusCode
  topCardCount: number
  hasNearMissStructures: boolean
  viabilityHasFullRow: boolean
  viabilityGapNumeric: number | null
  historicalRegistryPresent: boolean
}

export interface OperatorActionResult {
  precedence: 1 | 2 | 3 | 4 | 5 | 6 | 7
  primary: string
  why: string
  secondary: string[]
}

function secondaryChips(ctx: OperatorActionContext, precedence: number): string[] {
  const out: string[] = []
  if (!ctx.historicalRegistryPresent) {
    out.push('Historical feature registry not loaded — sync if you need coverage context')
  }
  if (!ctx.viabilityHasFullRow && ctx.verdict === 'NOT PLAYABLE') {
    out.push('Viability gap row incomplete — export + sync card EV viability')
  }
  if (precedence === 4 || (ctx.slateCode === 'NEAR_LOCK' && ctx.verdict === 'NOT PLAYABLE')) {
    out.push('Watch for lock within ~45 min (dashboard slate rule)')
  }
  if (ctx.verdict === 'PLAYABLE' && ctx.topCardCount === 0) {
    out.push('No rows in top-EV CSV slice — reconcile CSV with last run')
  }
  return out.slice(0, 2)
}

export function deriveOperatorAction(ctx: OperatorActionContext): OperatorActionResult {
  if (!ctx.fetchDone) {
    return {
      precedence: 7,
      primary: 'Wait for dashboard data',
      why: 'Reports are still loading.',
      secondary: [],
    }
  }

  // 1 — sync / missing run status
  if (ctx.loadError || !ctx.runStatusPresent) {
    return {
      precedence: 1,
      primary: 'Sync reports before acting',
      why:
        ctx.loadError ??
        'latest_run_status.json is missing — run `npm run sync:dashboard-reports` after pipeline exports.',
      secondary: secondaryChips(ctx, 1),
    }
  }

  // 2 — playable + visible opportunities in CSV
  if (ctx.verdict === 'PLAYABLE' && ctx.topCardCount > 0) {
    return {
      precedence: 2,
      primary: 'Review top cards now',
      why: 'Verdict is PLAYABLE and the synced CSV exposes top-EV cards in the opportunity slice.',
      secondary: secondaryChips(ctx, 2),
    }
  }

  // 2b — playable verdict but empty top slice (data mismatch)
  if (ctx.verdict === 'PLAYABLE' && ctx.topCardCount === 0) {
    return {
      precedence: 2,
      primary: 'Reconcile synced CSV with last run',
      why: 'Verdict is PLAYABLE but the top-EV card slice from synced CSV is empty — refresh or redeploy dashboard data.',
      secondary: secondaryChips(ctx, 2),
    }
  }

  // 3 — no actionable slate window
  if (ctx.slateCode === 'NO_FUTURE_LEGS' || ctx.slateCode === 'OUTSIDE_WINDOW') {
    return {
      precedence: 3,
      primary: 'Wait for future legs / next slate',
      why:
        ctx.slateCode === 'NO_FUTURE_LEGS'
          ? 'Leg CSV shows no future game times — nothing left to act on in this snapshot.'
          : 'No legs with future game times in the CSV — games may have started or times are missing.',
      secondary: secondaryChips(ctx, 3),
    }
  }

  // 4 — near lock, not playable
  if (ctx.slateCode === 'NEAR_LOCK' && ctx.verdict === 'NOT PLAYABLE') {
    return {
      precedence: 4,
      primary: 'Monitor slate — near lock',
      why: 'Next leg starts within ~45 minutes while verdict is NOT PLAYABLE — decide quickly or wait for the next board.',
      secondary: secondaryChips(ctx, 4),
    }
  }

  // 5 — not playable but near-miss structures in viability JSON
  if (ctx.verdict === 'NOT PLAYABLE' && ctx.hasNearMissStructures) {
    return {
      precedence: 5,
      primary: 'Inspect near-miss viability samples',
      why: 'No exported cards match the bar, but PP viability samples show structures closest to threshold.',
      secondary: secondaryChips(ctx, 5),
    }
  }

  // 6 — negative viability gap when row exists
  if (
    ctx.verdict === 'NOT PLAYABLE' &&
    ctx.viabilityHasFullRow &&
    ctx.viabilityGapNumeric != null &&
    ctx.viabilityGapNumeric < 0
  ) {
    return {
      precedence: 6,
      primary: 'Monitor and wait — EV below export bar',
      why: 'Best sampled raw card EV remains below the sport threshold on the last viability export.',
      secondary: secondaryChips(ctx, 6),
    }
  }

  // 7 — fallback
  return {
    precedence: 7,
    primary: 'Review decision + diagnostics',
    why: ctx.primaryReason || 'State is mixed — use the verdict, opportunity, and supporting detail above.',
    secondary: secondaryChips(ctx, 7),
  }
}
