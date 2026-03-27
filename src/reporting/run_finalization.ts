import type { CardEvResult } from "../types";
import type { OptimizerEdgeQualityRunStatusSummary } from "./optimizer_edge_quality_audit";
import type { LiveMergeInputSummary, RunHealth, RunOutcome, RunStatusJson } from "./run_status";
import { buildRunStatus, resolveStandardArtifactPaths, tryWriteRunStatusArtifacts } from "./run_status";

type ExpectedArtifactSpec = {
  prizepicksCards?: boolean;
  underdogCards?: boolean;
  prizepicksPicks?: boolean;
  underdogPicks?: boolean;
};

export interface FinalizeRunStatusInput {
  rootDir: string;
  generatedAtUtc: string;
  runTimestamp: string | null;
  outcome: RunOutcome;
  success: boolean;
  runHealth?: RunHealth;
  earlyExitReason?: string | null;
  fatalReason?: string | null;
  ppCards: CardEvResult[];
  ppPicksCount: number | null;
  udCards: CardEvResult[];
  udPicksCount: number | null;
  digest: {
    generated: boolean;
    shownCount: number | null;
    dedupedCount: number | null;
  };
  notes?: string[];
  degradationReasons?: string[];
  expectedArtifacts?: ExpectedArtifactSpec;
  liveMergeInput?: LiveMergeInputSummary;
  optimizerEdgeQuality?: OptimizerEdgeQualityRunStatusSummary;
}

export function finalizeCanonicalRunStatus(input: FinalizeRunStatusInput): RunStatusJson {
  const artifacts = resolveStandardArtifactPaths(input.rootDir);
  const missingExpectedArtifacts: string[] = [];
  const expected = input.expectedArtifacts ?? {};
  if (expected.prizepicksCards && !artifacts.prizepicksCardsCsvPath) missingExpectedArtifacts.push("prizepicks-cards.csv");
  if (expected.underdogCards && !artifacts.underdogCardsCsvPath) missingExpectedArtifacts.push("underdog-cards.csv");
  if (expected.prizepicksPicks && !artifacts.prizepicksPicksCsvPath) missingExpectedArtifacts.push("prizepicks-legs.csv");
  if (expected.underdogPicks && !artifacts.underdogPicksCsvPath) missingExpectedArtifacts.push("underdog-legs.csv");

  const degradationReasons = Array.from(
    new Set([
      ...(input.degradationReasons ?? []),
      ...missingExpectedArtifacts.map((f) => `missing_expected_artifact:${f}`),
      ...(input.liveMergeInput?.liveInputDegraded ? ["live_input_degraded"] : []),
      ...(input.optimizerEdgeQuality?.degradedOutput ? ["optimizer_output_degraded"] : []),
    ])
  ).sort();

  const runHealth =
    input.runHealth ??
    (input.outcome === "fatal_exit"
      ? "hard_failure"
      : input.outcome === "early_exit"
      ? "partial_completion"
      : degradationReasons.length > 0
      ? "degraded_success"
      : "success");

  const status = buildRunStatus({
    generatedAtUtc: input.generatedAtUtc,
    runTimestamp: input.runTimestamp,
    success: input.success,
    runHealth,
    outcome: input.outcome,
    earlyExitReason: input.earlyExitReason ?? null,
    fatalReason: input.fatalReason ?? null,
    ppCards: input.ppCards,
    ppPicksCount: input.ppPicksCount,
    udCards: input.udCards,
    udPicksCount: input.udPicksCount,
    digest: input.digest,
    artifacts: { ...artifacts, telegramDigestPath: null },
    liveMergeInput: input.liveMergeInput,
    optimizerEdgeQuality: input.optimizerEdgeQuality,
    notes: input.notes ?? [],
    degradationReasons,
    missingExpectedArtifacts,
  });
  tryWriteRunStatusArtifacts(input.rootDir, status);
  return status;
}
