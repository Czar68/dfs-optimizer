// src/odds/normalize_odds.ts
// Shared American odds validation so both SGO and TRD flows reject invalid values.

import { SgoPlayerPropOdds } from "../types";

/**
 * Valid American odds: non-zero, abs >= 100, abs <= 10000.
 * Rejects garbage values like -1, -2, 0, +50 that providers sometimes return.
 */
export function isValidAmericanOdds(odds: number): boolean {
  if (!isFinite(odds) || odds === 0) return false;
  const abs = Math.abs(odds);
  return abs >= 100 && abs <= 10000;
}

/**
 * Filter odds rows to only those with valid over/under American odds.
 * Used by the snapshot manager so both SGO and TRD results are protected.
 */
export function filterValidOddsRows(rows: SgoPlayerPropOdds[]): {
  rows: SgoPlayerPropOdds[];
  invalidDropped: number;
} {
  const kept: SgoPlayerPropOdds[] = [];
  let invalidDropped = 0;
  for (const r of rows) {
    const overOk = r.overOdds != null && isValidAmericanOdds(r.overOdds);
    const underOk = r.underOdds != null && isValidAmericanOdds(r.underOdds);
    if (overOk && underOk) {
      kept.push(r);
    } else {
      invalidDropped++;
    }
  }
  return { rows: kept, invalidDropped };
}
