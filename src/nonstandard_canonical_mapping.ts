/**
 * Maps an EV-stage pick shape to canonical leg math input + optional modeling labels.
 * No per-leg formulas here — edge comes from math_models/nonstandard_canonical_leg_math.
 */

import type { EvPick } from "./types";
import type { CanonicalLegMathInput } from "../math_models/nonstandard_canonical_leg_math";

/** Fields calculate_ev supplies before full EvPick id/edge/legEv are finalized. */
export type EvPickCanonicalMappingSource = Pick<
  EvPick,
  | "sport"
  | "site"
  | "league"
  | "player"
  | "team"
  | "opponent"
  | "stat"
  | "line"
  | "projectionId"
  | "gameId"
  | "startTime"
  | "outcome"
  | "trueProb"
  | "fairOdds"
  | "edge"
  | "book"
  | "overOdds"
  | "underOdds"
  | "legEv"
  | "isNonStandardOdds"
  | "udPickFactor"
  | "nonStandard"
  | "legKey"
  | "legLabel"
> & { id: string };

export interface CanonicalLegMappingResult {
  canonicalLeg: CanonicalLegMathInput;
  modelingClass: string;
  modelingReason: string;
}

export function mapEvPickToCanonicalLegMathInput(
  pick: EvPickCanonicalMappingSource
): CanonicalLegMappingResult {
  const udModifier =
    pick.site === "underdog" && pick.nonStandard?.category === "underdog_pick_factor_modifier";

  const canonicalLeg: CanonicalLegMathInput = {
    trueProb: pick.trueProb,
    overOdds: pick.overOdds,
    underOdds: pick.underOdds,
    outcome: pick.outcome,
  };

  if (udModifier) {
    return {
      canonicalLeg,
      modelingClass: "underdog_pick_factor_modifier",
      modelingReason: "underdog_api_multiplier_metadata_present",
    };
  }

  return {
    canonicalLeg,
    modelingClass: "standard_juice_aware",
    modelingReason: "juiceAwareLegEv",
  };
}
