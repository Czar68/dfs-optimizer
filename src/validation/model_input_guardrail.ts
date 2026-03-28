import type { MergedPick } from "../types";

export type ModelInputRejectCode =
  | "missing_required_identity"
  | "invalid_line"
  | "invalid_true_prob"
  | "invalid_outcome"
  | "invalid_over_odds"
  | "invalid_under_odds"
  | "invalid_ud_pick_factor"

export interface ModelInputValidationResult {
  ok: boolean;
  code?: ModelInputRejectCode;
  detail?: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateModelInputPick(pick: MergedPick): ModelInputValidationResult {
  if (
    !pick.site ||
    !pick.sport ||
    !pick.league ||
    !pick.player ||
    !pick.stat ||
    !pick.projectionId
  ) {
    return {
      ok: false,
      code: "missing_required_identity",
      detail: "site/sport/league/player/stat/projectionId required",
    };
  }

  if (!isFiniteNumber(pick.line)) {
    return { ok: false, code: "invalid_line", detail: "line must be finite" };
  }

  if (!isFiniteNumber(pick.trueProb)) {
    return { ok: false, code: "invalid_true_prob", detail: "trueProb must be finite" };
  }

  const rawOutcome = (pick as { outcome?: unknown }).outcome;
  if (
    rawOutcome !== undefined &&
    rawOutcome !== null &&
    rawOutcome !== "over" &&
    rawOutcome !== "under"
  ) {
    return {
      ok: false,
      code: "invalid_outcome",
      detail: "outcome must be over|under when provided",
    };
  }

  if (pick.overOdds != null && !isFiniteNumber(pick.overOdds)) {
    return {
      ok: false,
      code: "invalid_over_odds",
      detail: "overOdds must be finite when provided",
    };
  }

  if (pick.underOdds != null && !isFiniteNumber(pick.underOdds)) {
    return {
      ok: false,
      code: "invalid_under_odds",
      detail: "underOdds must be finite when provided",
    };
  }

  const udPickFactor = (pick as { udPickFactor?: unknown }).udPickFactor;
  if (udPickFactor != null && (!isFiniteNumber(udPickFactor) || udPickFactor <= 0)) {
    return {
      ok: false,
      code: "invalid_ud_pick_factor",
      detail: "udPickFactor must be finite and > 0 when provided",
    };
  }

  const hasUnderdogModifierMeta =
    pick.nonStandard?.category === "underdog_pick_factor_modifier";
  const hasUdFactor = udPickFactor != null;

  return { ok: true };
}
