/**
 * Phase 17K — Shared Underdog pick factor helpers (single source for UD leg filter + card builder).
 * No EV formula changes; same logic as former run_underdog_optimizer inline helpers.
 */

import { getBreakevenForStructure } from "../config/binomial_breakeven";
import type { EvPick } from "../types";

export function resolveUdFactor(p: EvPick): number | null {
  if (p.udPickFactor !== null && p.udPickFactor !== undefined) return p.udPickFactor;
  return null;
}

export function udAdjustedLegEv(p: EvPick): number {
  const factor = resolveUdFactor(p) ?? 1.0;
  const baseBE = getBreakevenForStructure("UD_2P_STD");
  return p.trueProb - baseBE / factor;
}
