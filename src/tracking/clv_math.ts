/**
 * Closing Line Value helpers — pure math, no EV pipeline changes.
 *
 * Definitions (Phase 16N):
 * - **openImpliedProb** / **closeImpliedProb**: vigged implied probability from American odds
 *   for the chosen side at selection vs before game (close), from `americanToImpliedProb`.
 * - **clvDelta** = closeImpliedProb − openImpliedProb (undefined if either missing).
 * - **clvPct** = (clvDelta / openImpliedProb) × 100 when openImpliedProb > 0; else undefined.
 *
 * Model **trueProb** (edge) is separate; stored as trueProb / projectedProb on legs.
 */

export interface ClvDerived {
  clvDelta?: number;
  clvPct?: number;
}

export function deriveClvMetrics(
  openImpliedProb: number | undefined,
  closeImpliedProb: number | undefined
): ClvDerived {
  if (
    openImpliedProb == null ||
    closeImpliedProb == null ||
    !Number.isFinite(openImpliedProb) ||
    !Number.isFinite(closeImpliedProb)
  ) {
    return {};
  }
  const clvDelta = closeImpliedProb - openImpliedProb;
  const clvPct = openImpliedProb > 1e-9 ? (clvDelta / openImpliedProb) * 100 : undefined;
  return { clvDelta, clvPct };
}
