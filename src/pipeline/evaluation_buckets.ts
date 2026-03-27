/**
 * Phase 17L — Canonical bucketed evaluation architecture (ordering + types + runner).
 * Math (EV/breakeven/payout) unchanged; this file enforces **stage naming** and **sequence**.
 *
 * Approved platform variance is intended only in **platform_math** (PP vs UD adapters).
 * match_merge must consume OddsAPI-linked rows via the same merge entrypoints (mergeWithSnapshot).
 */

import type { CardEvResult, EvPick, MergedPick, RawPick } from "../types";

/** Canonical bucket order — every platform must use these ids in this sequence for a full run. */
export const EVALUATION_BUCKET_ORDER = [
  "ingest",
  "normalize",
  "match_merge",
  "shared_eligibility",
  "platform_math",
  "structure_evaluation",
  "selection_export",
  "render_input",
] as const;

export type EvaluationBucketId = (typeof EVALUATION_BUCKET_ORDER)[number];

/** Raw props from site/API/scrape before merge. */
export type RawSourcePayload = RawPick[];

/** After schema cleanup / import CSV (identity or passthrough on RawPick[]). */
export type NormalizedPickCandidate = RawPick;

/** Single merged row (OddsAPI-linked). */
export type MergedCandidateRecord = MergedPick;

/** Compact eligibility outcome (extensible). */
export interface EligibilityDecision {
  passed: boolean;
  reasonCode?: string;
}

/** Batch after shared + platform math on legs. */
export interface PlatformMathLegBatch {
  legs: EvPick[];
  platform: "pp" | "ud";
}

/** Cards produced from structure passes (pre cap). */
export interface StructureEvaluationCardSet {
  cards: CardEvResult[];
  platform: "pp" | "ud";
}

/** Post–selection-engine / capped export set. */
export interface SelectionExportBatch {
  cards: CardEvResult[];
  platform: "pp" | "ud";
}

/** Rows / files aimed at Sheets, CSV, dashboard (canonical shapes). */
export interface RenderInputPayload {
  platform: "pp" | "ud";
  /** Opaque handles — writers stay in runners; bucket only types the contract. */
  artifactHints: string[];
}

/** Documented: merge with OddsAPI snapshot rows is the shared match_merge path. */
export const MATCH_MERGE_SHARED_ENTRYPOINT = "mergeWithSnapshot(raw, oddsSnapshot.rows, ...)";

export function getCanonicalBucketOrder(): readonly EvaluationBucketId[] {
  return EVALUATION_BUCKET_ORDER;
}

/** True iff `slice` equals `full[offset : offset+slice.length]`. */
export function isContiguousBucketSlice(
  full: readonly EvaluationBucketId[],
  slice: readonly EvaluationBucketId[],
  offset: number
): boolean {
  if (offset < 0 || offset + slice.length > full.length) return false;
  for (let i = 0; i < slice.length; i++) {
    if (full[offset + i] !== slice[i]) return false;
  }
  return true;
}

export function assertBucketsMatchOrder(
  actualIds: readonly EvaluationBucketId[],
  expectedSlice: readonly EvaluationBucketId[]
): void {
  if (actualIds.length !== expectedSlice.length) {
    throw new Error(
      `[evaluation_buckets] Expected ${expectedSlice.length} buckets, got ${actualIds.length}: ${actualIds.join(",")}`
    );
  }
  for (let i = 0; i < expectedSlice.length; i++) {
    if (actualIds[i] !== expectedSlice[i]) {
      throw new Error(
        `[evaluation_buckets] At index ${i}: expected ${expectedSlice[i]}, got ${actualIds[i]}`
      );
    }
  }
}

/**
 * Run a **contiguous sub-sequence** of the canonical pipeline (PP may split: ingest→shared, platform_math, structure→render).
 */
export async function runBucketSlice(
  platform: "pp" | "ud",
  expectedSlice: readonly EvaluationBucketId[],
  steps: ReadonlyArray<{ id: EvaluationBucketId; run: () => void | Promise<void> }>
): Promise<void> {
  const ids = steps.map((s) => s.id);
  assertBucketsMatchOrder(ids, expectedSlice);
  void platform;
  for (const s of steps) {
    await s.run();
  }
}

/** Run a single canonical bucket (validates id spelling + ordering for a 1-step slice). */
export async function runSingleBucket(
  platform: "pp" | "ud",
  id: EvaluationBucketId,
  run: () => void | Promise<void>
): Promise<void> {
  await runBucketSlice(platform, [id], [{ id, run }]);
}

/** Approved non-shared behavior labels (for tests / docs only). */
export const APPROVED_PLATFORM_MATH_VARIANCE = {
  pp: [
    "PrizePicks leg pipeline: historical calibration, structure pipeline, opp/corr tweaks, effective EV gate, global per-player cap (runtime_decision_pipeline + run_optimizer).",
  ],
  ud: [
    "Underdog filterUdEvPicksCanonical: factor<1 decline, shared min-edge (udMinEdge), std/boost leg EV floors, shared FCFS cap with per-site-player-stat key (runtime_decision_pipeline + shared_leg_eligibility).",
    "UD card builder: structure breakeven + edge floor per structure (run_underdog_optimizer).",
  ],
} as const;
