// src/engine_contracts.ts
// Shared contracts for PP and UD engines.
// Step 2 refactor: defines the interface both engines must satisfy.
// No behavior changes — existing math in pp_engine / ud_engine is unchanged.

import { EvPick, CardEvResult, FlexType, MergedPick } from "./types";

/**
 * Normalized leg candidate produced by any platform engine's filterLegs().
 * Wraps EvPick with optional platform-specific metadata.
 */
export interface LegCandidate {
  pick: EvPick;
  effectiveEv: number;   // adjEv ?? legEv (platform-specific)
  platform: "pp" | "ud";
}

/**
 * Card candidate produced by any platform engine's buildCards().
 * Wraps CardEvResult with platform tag and structure info.
 */
export interface CardCandidate {
  card: CardEvResult;
  platform: "pp" | "ud";
  structure: string;       // e.g. "2P", "3F", "UD_3P_STD", etc.
}

/**
 * Thresholds returned by getThresholds() for logging/audit.
 */
export interface EngineThresholds {
  minEdge: number;
  minLegEv: number;
  maxLegsPerPlayer: number;
  platform: "pp" | "ud";
  extra?: Record<string, unknown>;
}

/**
 * Summary of a filter/build run for parity verification.
 */
export interface EngineSummary {
  platform: "pp" | "ud";
  mergedPicks: number;
  legsAfterFilter: number;
  cardsBuilt: number;
  cardsAfterFilter: number;
  topCardEvs: number[];     // top-5 card EVs for parity check
}

/**
 * Contract that both PP and UD engines implement.
 * Each method wraps existing code — no new math.
 */
export interface PlatformEngine {
  readonly platform: "pp" | "ud";

  /** Return thresholds for logging/audit */
  getThresholds(): EngineThresholds;

  /**
   * Filter merged picks into viable leg candidates.
   * Wraps existing inline filter logic (PP: run_optimizer.ts, UD: filterEvPicks).
   */
  filterLegs(evPicks: EvPick[]): LegCandidate[];

  /**
   * Build cards from filtered leg candidates.
   * Wraps existing card builder (PP: buildCardsForSize, UD: buildUdCardsFromFiltered).
   */
  buildCards(legs: LegCandidate[], runTimestamp: string): Promise<CardCandidate[]>;

  /**
   * Export legs and cards to CSV/JSON (same files as today).
   * Wraps existing writeLegsCsv/writeCardsCsv/etc.
   */
  exportResults(legs: LegCandidate[], cards: CardCandidate[], runTimestamp: string): void;

  /** Produce a summary for parity checking */
  summarize(mergedCount: number, legs: LegCandidate[], cards: CardCandidate[]): EngineSummary;
}

/**
 * Platform-aware break-even label for display purposes only.
 * Does NOT change any math — purely for logging clarity.
 */
export function breakEvenProbLabel(platform: "pp" | "ud"): string {
  if (platform === "ud") {
    return "edge vs 0.50 shown for PP convention; UD pricing handled by udAdjustedLegEv()";
  }
  return "edge vs 0.50 (PP standard binary)";
}
