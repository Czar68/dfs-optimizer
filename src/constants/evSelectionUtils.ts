/**
 * Single source of truth for which EV field is used for card selection, filtering, and ranking.
 * When ENABLE_CALIBRATION_ADJEV is on, use adjEv (when set); otherwise use legEv.
 */

import type { EvPick } from "../types";
import { FLAGS } from "./featureFlags";

/**
 * Returns the EV value to use for selection/filtering/ranking.
 * When FLAGS.calibrationAdjEv is on and leg.adjEv is set, returns adjEv; otherwise returns legEv.
 */
export function getSelectionEv(leg: EvPick): number {
  if (FLAGS.calibrationAdjEv && leg.adjEv !== undefined) return leg.adjEv;
  return leg.legEv;
}

/**
 * Returns "adjEv" or "legEv" for log messages so it is clear which signal is active.
 */
export function getSelectionEvLabel(): string {
  return FLAGS.calibrationAdjEv ? "adjEv" : "legEv";
}
