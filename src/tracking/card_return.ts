/**
 * Map graded tracker legs → gross payout multiplier using canonical parlay_structures.
 * Does not change EV math — only resolves realized return from leg outcomes + structure id.
 */

import { getPayoutByHits, getStructure } from "../config/parlay_structures";
import type { TrackedCard } from "./tracker_schema";

export function structureIdForTrackedCard(card: TrackedCard): string {
  if (card.structureId && String(card.structureId).trim()) return String(card.structureId).trim();
  return card.flexType;
}

/**
 * Gross payout multiplier from payoutByHits (same units as analytics_engine historically used).
 * Flex: uses win count; Power/Standard: full payout only if all legs Win and no Loss/Push.
 * Push on flex → ambiguous (real books vary); excluded from numeric return (gross 0, ambiguous true).
 */
export function computeGradedCardGrossReturn(card: TrackedCard): { gross: number; ambiguous: boolean } {
  const sid = structureIdForTrackedCard(card);
  const payouts = getPayoutByHits(sid);
  if (!payouts) return { gross: 0, ambiguous: true };

  const def = getStructure(sid);
  const n = card.legs.length;
  const wins = card.legs.filter((l) => l.result === "Win").length;
  const losses = card.legs.filter((l) => l.result === "Loss").length;
  const pushes = card.legs.filter((l) => l.result === "Push").length;

  const type = def?.type;

  if (type === "Power" || type === "Standard") {
    if (losses > 0) return { gross: 0, ambiguous: false };
    if (pushes > 0) return { gross: 0, ambiguous: true };
    if (wins === n) {
      const g = payouts[n];
      return { gross: typeof g === "number" ? g : 0, ambiguous: false };
    }
    return { gross: 0, ambiguous: false };
  }

  if (type === "Flex") {
    if (pushes > 0) return { gross: 0, ambiguous: true };
    const g = payouts[wins];
    return { gross: typeof g === "number" ? g : 0, ambiguous: false };
  }

  return { gross: 0, ambiguous: true };
}

/** True if graded card received any positive payout under schedule (flex partial or full power). */
export function cardReceivedPayout(card: TrackedCard): boolean {
  const { gross, ambiguous } = computeGradedCardGrossReturn(card);
  if (ambiguous) return false;
  return gross > 0;
}
