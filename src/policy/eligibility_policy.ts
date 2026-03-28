/**
 * Phase 17J — Cross-platform eligibility policy contract (data-first, deterministic).
 * Does not alter EV/breakeven/ranking math; documents and compares survival gates only.
 */

import fs from "fs";
import path from "path";
import type { CliArgs } from "../cli_args";
import type { EvPick } from "../types";
import { resolveUdFactor, udAdjustedLegEv } from "./ud_pick_factor";
import {
  UNDERDOG_FLEX_STRUCTURES,
  UNDERDOG_GLOBAL_LEG_EV_FLOOR,
  UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION,
} from "../config/underdog_structures";

// True probability floors for leg filtering (1% below lowest structure breakeven)
export const PP_MIN_TRUE_PROB = 0.532;  // 1% below PP lowest breakeven (0.5421)
export const UD_MIN_TRUE_PROB = 0.524;  // 1% below UD lowest breakeven (0.5340)  
export const UD_BOOSTED_MIN_TRUE_PROB = 0.520;  // Slightly looser for boosted picks

export const SCHEMA_VERSION = 1 as const;

export type PolicyClassification =
  | "shared"
  | "platform_specific_approved"
  | "platform_specific_needs_review";

export type PolicyDiffRelation =
  | "identical"
  | "intentionally_different"
  | "missing_in_pp"
  | "missing_in_ud"
  | "runner_divergence";

/** Resolved PP runner leg gates — formulas must match `src/run_optimizer.ts` (MIN_EDGE_PER_LEG, MIN_LEG_EV, ppEvAdjThresh, MAX_LEGS_PER_PLAYER). */
export function computePpRunnerLegEligibility(args: CliArgs): {
  minTrueProb: number;
  maxLegsPerPlayerGlobal: number;
  volumeMode: boolean;
} {
  const minTrueProb = PP_MIN_TRUE_PROB;  // Replace edge-based filters with trueProb floor
  const maxLegsPerPlayerGlobal = args.volume ? 2 : 1;
  return {
    minTrueProb,
    maxLegsPerPlayerGlobal,
    volumeMode: !!args.volume,
  };
}

/** PP card pool filter inside buildCardsForSize — `cliArgs.minEdge ?? 0.015`, volume uses trueProb>0.5. */
export function computePpCardPoolLegGate(args: CliArgs): {
  minEdgeForTrueProbVsBreakeven: number;
  volumeModePoolUsesPositiveEdgeOnly: boolean;
} {
  return {
    minEdgeForTrueProbVsBreakeven: args.minEdge ?? 0.015,
    volumeModePoolUsesPositiveEdgeOnly: !!args.volume,
  };
}

/** PP early exit when fewer than this many legs remain after global player cap. */
export const PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD = 6;

/**
 * Legacy contract field: PP engine and main runner now share {@link computePpRunnerLegEligibility} (Phase 17K).
 * Kept for JSON schema stability on eligibility artifacts.
 */
export function computePpEngineWrapperThresholds(args: CliArgs): {
  minTrueProb: number;
  maxLegsPerPlayer: number;
} {
  const p = computePpRunnerLegEligibility(args);
  return {
    minTrueProb: p.minTrueProb,
    maxLegsPerPlayer: p.maxLegsPerPlayerGlobal,
  };
}

/** Resolved UD runner — `udVolume`, `udMinLegEv`, `udMinEdge` match module scope in `src/run_underdog_optimizer.ts`. */
export function computeUdRunnerLegEligibility(args: CliArgs): {
  udVolume: boolean;
  udMinLegEv: number;
  udMinEdge: number;
  maxLegsPerPlayerPerStat: number;
} {
  const udVolume = !!(args.udVolume || args.volume);
  const udMinLegEv = args.udMinEv ?? args.minEv ?? 0.004;
  /** Phase 74: relaxed from 0.008 for market-relative gating; std pick floor remains 0.005 in filter. */
  const udMinEdge = args.minEdge ?? (udVolume ? 0.004 : 0.006);
  return {
    udVolume,
    udMinLegEv,
    udMinEdge,
    maxLegsPerPlayerPerStat: 1,
  };
}

/** Standard-pick leg trueProb floors inside `filterEvPicks` (before per-player/stat cap). */
export function computeUdFilterEvPicksStandardFloors(udVolume: boolean): {
  standardPickMinTrueProb: number;
} {
  return { standardPickMinTrueProb: UD_MIN_TRUE_PROB };
}

/** Boosted-pick floor uses udAdjustedLegEv >= (volume ? -0.01 : 0) and trueProb >= boostedMinTrueProb. */
export function computeUdFilterBoostedFloors(udVolume: boolean): { boostedAdjLegEvFloor: number; boostedMinTrueProb: number } {
  return {
    boostedAdjLegEvFloor: udVolume ? -0.01 : 0,
    boostedMinTrueProb: UD_BOOSTED_MIN_TRUE_PROB,
  };
}

/**
 * Phase AP — `buildUdCardsFromFiltered` viable-leg admission (single predicate).
 * Default: raw `leg.legEv >= minLegEv`. When experiment is on: **boosted only** (`factor > 1`) uses
 * `udAdjustedLegEv >= boostedAdjLegEvFloor` (same floor as runner boosted tier in `filterUdEvPicksCanonical`).
 */
export function passesUdBuilderViableLegEvFloor(
  leg: EvPick,
  minLegEv: number,
  udVolumePolicy: boolean,
  boostedBuilderAlignExperiment: boolean
): boolean {
  const f = resolveUdFactor(leg);
  const { boostedAdjLegEvFloor } = computeUdFilterBoostedFloors(udVolumePolicy);
  if (boostedBuilderAlignExperiment && f !== null && f > 1.0) {
    return udAdjustedLegEv(leg) >= boostedAdjLegEvFloor;
  }
  return leg.legEv >= minLegEv;
}

export interface NormalizedPlatformPolicy {
  platform: "pp" | "ud";
  runtimeSource: string;
  stageOrder: string[];
  legGates: Record<string, unknown>;
  cardConstructionGates: Record<string, unknown>;
  exportAndRanking: Record<string, unknown>;
  ancillaryNotes: string[];
}

export function buildPrizePicksEligibilityPolicy(args: CliArgs): NormalizedPlatformPolicy {
  const leg = computePpRunnerLegEligibility(args);
  const pool = computePpCardPoolLegGate(args);
  const engine = computePpEngineWrapperThresholds(args);
  const maxExport =
    args.exportUncap ? "uncapped" : args.platform === "both" ? args.maxCards : args.maxExport;

  return {
    platform: "pp",
    runtimeSource: "src/run_optimizer.ts",
    stageOrder: [
      "merge_with_odds_snapshot",
      "calculate_ev_for_merged_picks",
      "filter_min_edge_per_leg",
      "filter_min_leg_ev",
      "calibration_pipeline_tweaks_adj_ev",
      "filter_effective_ev_vs_adjusted_threshold",
      "global_player_cap_across_legs",
      "early_exit_if_legs_lt_6",
      "build_cards_per_structure",
      "filter_cards_per_slip_min_ev",
      "selection_engine_breakeven_anti_dilution",
      "sort_cards",
      "export_slice",
      "portfolio_diversification_greedy_export",
    ],
    legGates: {
      minTrueProb: leg.minTrueProb,
      effectiveEvDefinition: "adjEv ?? legEv",
      maxLegsPerPlayerGlobal: leg.maxLegsPerPlayerGlobal,
      volumeMode: leg.volumeMode,
    },
    cardConstructionGates: {
      poolMinEdgeVersusStructureBreakeven: pool.minEdgeForTrueProbVsBreakeven,
      volumePoolRule: pool.volumeModePoolUsesPositiveEdgeOnly
        ? "trueProb > 0.50 (any positive edge)"
        : "trueProb >= structureBE + minEdge",
      maxLegsPool: 30,
      maxCardBuildTries: 3000,
      dedupeTiming:
        "after_candidate_generation_dedupeCardCandidatesByLegIdSetBestCardEv_shared_card_construction_gates",
      oppositeSideExclusionTiming:
        "during_candidate_sampling_firstCardConstructionGateFailure_shared_card_construction_gates",
      ppMinEligibleLegsForCardBuild: PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD,
    },
    exportAndRanking: {
      maxExportOrMaxCardsWhenBoth: maxExport,
      exportUncap: args.exportUncap,
      exportResolver: "resolvePrizePicksRunnerExportCardLimit",
      sortOrder: "cardEv_desc_then_winProbCash_then_leg_ids",
    },
    ancillaryNotes: [
      "pp_engine.ts (PrizepicksEngine) uses fixed-style floors that diverge from run_optimizer when --volume is set — see ppEngineWrapperThresholds in contract JSON.",
      `Engine snapshot: minTrueProb=${engine.minTrueProb} maxLegsPerPlayer=${engine.maxLegsPerPlayer}`,
      `Phase 77: after export_slice, optional greedy portfolio diversification (src/policy/portfolio_diversification.ts) unless --no-portfolio-diversification; writes data/reports/latest_portfolio_diversification.*.`,
    ],
  };
}

export function buildUnderdogEligibilityPolicy(args: CliArgs): NormalizedPlatformPolicy {
  const leg = computeUdRunnerLegEligibility(args);
  const stdFloors = computeUdFilterEvPicksStandardFloors(leg.udVolume);
  const boostFloors = computeUdFilterBoostedFloors(leg.udVolume);
  const maxCapResolved = args.exportUncap ? "uncapped" : (args.maxCards ?? 800);

  return {
    platform: "ud",
    runtimeSource: "src/run_underdog_optimizer.ts",
    stageOrder: [
      "merge_with_odds",
      "calculate_ev_for_merged_picks",
      "ud_platform_math_factor_lt1_decline",
      "shared_min_edge_gate_udMinEdge",
      "ud_platform_math_std_boost_ev_tiers",
      "shared_fcfs_cap_per_site_player_stat",
      "optional_site_underdog_only_when_not_shared_legs",
      "build_ud_cards_by_structure",
      "global_sort_all_cards_by_card_ev",
      "slice_max_cards_cap_shared_resolver",
      "write_csv_json",
    ],
    legGates: {
      udMinLegEvForCardBuilder: leg.udMinLegEv,
      udMinEdgeDefault: leg.udMinEdge,
      udVolume: leg.udVolume,
      factorLt1: "decline_all",
      standardPickMinTrueProbInFilterEvPicks: stdFloors.standardPickMinTrueProb,
      boostedPickUdAdjustedLegEvFloor: boostFloors.boostedAdjLegEvFloor,
      maxLegsPerPlayerPerStat: leg.maxLegsPerPlayerPerStat,
      underdogGlobalLegEvFloorRegistry: 0.004,
      noteRegistryFloorVsFilter:
        "UNDERDOG_GLOBAL_LEG_EV_FLOOR used in structure helpers; filterEvPicks applies leg.edge>=udMinEdge (sharedLegPassesMinEdge) after factor decline, then trueProb/adj tiers; card builder uses udMinLegEv.",
    },
    cardConstructionGates: {
      standardStructureIdsAllowed: [...UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION].sort(),
      flexStructureIdsAllowed: UNDERDOG_FLEX_STRUCTURES.map((s) => s.id).sort(),
      edgeFloorInCardBuilder: args.minEdge ?? 0.004,
      structureBreakevenPlusEdgeWhenNotUdVolume: "trueProb >= be(structureId) + edgeFloor",
      dedupeTiming:
        "after_generation_dedupeFormatCardEntriesByLegSetBestCardEv_shared_card_construction_gates",
      oppositeSideExclusionTiming:
        "during_k_combo_sampling_firstCardConstructionGateFailure_shared_card_construction_gates",
      globalCardSort: "cardEv_desc_all_structures",
    },
    exportAndRanking: {
      maxCardsCap: maxCapResolved,
      exportUncap: args.exportUncap,
      exportResolver: "resolveUnderdogRunnerExportCardCap",
      exportOrdering: "same_as_sorted_all_cards_after_cap",
    },
    ancillaryNotes: [
      "Shared legs mode (platform=both) reuses PP-filtered legs — policy for that path is 'shared_legs' not raw UD API.",
      ...(args.udBoostedGateExperiment
        ? [
            "Phase AK: udBoostedGateExperiment active — boosted legs use experimental gate order in filterUdEvPicksCanonical (see runtime_decision_pipeline).",
          ]
        : []),
      ...(args.udBoostedBuilderViableLegsExperiment
        ? [
            "Phase AS/AT: boosted builder viableLegs on-path — boosted legs use udAdjustedLegEv vs boosted floor (passesUdBuilderViableLegEvFloor); disable via env UD_BOOSTED_BUILDER_VIABLE_LEGS_EXPERIMENT=0 or CLI --no-ud-boosted-builder-viable-legs-experiment (explicit CLI wins over env).",
          ]
        : []),
    ],
  };
}

export interface PolicyDiffEntry {
  key: string;
  ppValue: unknown;
  udValue: unknown;
  relation: PolicyDiffRelation;
  classification: PolicyClassification;
  rationale: string;
}

/** Approved-by-design differences (explicit product/UX intent in code comments or architecture). */
const APPROVED_DIFF_KEYS = new Set<string>([
  "legGates.minTrueProb_vs_udMinEdge",
  "legGates.maxLegsPerPlayerGlobal_vs_maxLegsPerPlayerPerStat",
  "legGates.pp_effective_ev_vs_ud_factor_policy",
]);

function classifyDiff(entry: Omit<PolicyDiffEntry, "classification" | "rationale"> & { rationale: string }): PolicyDiffEntry {
  let classification: PolicyClassification = "platform_specific_needs_review";
  if (entry.relation === "identical") classification = "shared";
  else if (entry.relation === "intentionally_different" && APPROVED_DIFF_KEYS.has(entry.key)) {
    classification = "platform_specific_approved";
  } else if (entry.relation === "intentionally_different") {
    classification = "platform_specific_needs_review";
  } else if (entry.relation === "runner_divergence") {
    classification = "platform_specific_needs_review";
  } else {
    classification = "platform_specific_needs_review";
  }
  return { ...entry, classification };
}

/** Compare top-level policy fields and selected nested leg gates. */
export function compareEligibilityPolicies(
  pp: NormalizedPlatformPolicy,
  ud: NormalizedPlatformPolicy
): PolicyDiffEntry[] {
  const raw: Omit<PolicyDiffEntry, "classification">[] = [];

  const ppLeg = pp.legGates as Record<string, unknown>;
  const udLeg = ud.legGates as Record<string, unknown>;

  const push = (
    key: string,
    pv: unknown,
    uv: unknown,
    relation: PolicyDiffRelation,
    rationale: string
  ) => {
    raw.push({ key, ppValue: pv, udValue: uv, relation, rationale });
  };

  push(
    "legGates.minTrueProb_vs_udMinEdge",
    ppLeg.minTrueProb,
    udLeg.udMinEdgeDefault,
    "intentionally_different",
    "PP trueProb vs UD min edge; different metrics for different platforms."
  );

  push(
    "legGates.volumeMode_vs_udVolume",
    ppLeg.volumeMode,
    udLeg.udVolume,
    ppLeg.volumeMode === udLeg.udVolume ? "identical" : "intentionally_different",
    "PP volume mode vs UD volume mode; both enable looser thresholds."
  );

  push(
    "legGates.maxLegsPerPlayerGlobal_vs_maxLegsPerPlayerPerStat",
    ppLeg.maxLegsPerPlayerGlobal,
    udLeg.maxLegsPerPlayerPerStat,
    "intentionally_different",
    "PP caps legs per player globally; UD caps per player per stat (site:player:stat)."
  );

  push(
    "legGates.pp_effective_ev_vs_ud_factor_policy",
    "PP: adjEv ?? legEv vs threshold",
    "UD: decline factor<1; std 0.005/0.004; boosted udAdjustedLegEv",
    "intentionally_different",
    "Underdog payout factor is UD-only."
  );

  push(
    "volume.volumeMode_vs_udVolume",
    ppLeg.volumeMode,
    udLeg.udVolume,
    ppLeg.volumeMode === udLeg.udVolume ? "identical" : "intentionally_different",
    "UD udVolume = udVolume OR volume; PP volume is --volume only."
  );

  raw.sort((a, b) => a.key.localeCompare(b.key));

  return raw.map((r) =>
    classifyDiff({
      ...r,
      rationale: r.rationale,
    })
  );
}

export interface EligibilityPolicyContract {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAtUtc: string;
  cliArgsUsed: Pick<
    CliArgs,
    | "volume"
    | "udVolume"
    | "minEdge"
    | "minEv"
    | "udMinEv"
    | "maxCards"
    | "maxExport"
    | "exportUncap"
    | "platform"
    | "udBoostedGateExperiment"
    | "udBoostedBuilderViableLegsExperiment"
  >;
  shared: {
    invariants: string[];
  };
  prizePicks: NormalizedPlatformPolicy & {
    runnerLegEligibility: ReturnType<typeof computePpRunnerLegEligibility>;
    ppEngineWrapper: ReturnType<typeof computePpEngineWrapperThresholds>;
    runnerVsEngineDivergence: boolean;
  };
  underdog: NormalizedPlatformPolicy & {
    runnerLegEligibility: ReturnType<typeof computeUdRunnerLegEligibility>;
  };
  comparison: PolicyDiffEntry[];
}

export function buildEligibilityPolicyContract(args: CliArgs, generatedAtUtc: string): EligibilityPolicyContract {
  const pp = buildPrizePicksEligibilityPolicy(args);
  const ud = buildUnderdogEligibilityPolicy(args);
  const runner = computePpRunnerLegEligibility(args);
  const engine = computePpEngineWrapperThresholds(args);
  const runnerVsEngineDivergence = false;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAtUtc,
    cliArgsUsed: {
      volume: args.volume,
      udVolume: args.udVolume,
      minEdge: args.minEdge,
      minEv: args.minEv,
      udMinEv: args.udMinEv,
      maxCards: args.maxCards,
      maxExport: args.maxExport,
      exportUncap: args.exportUncap,
      platform: args.platform,
      udBoostedGateExperiment: args.udBoostedGateExperiment,
      udBoostedBuilderViableLegsExperiment: args.udBoostedBuilderViableLegsExperiment,
    },
    shared: {
      invariants: [
        "Both platforms merge props with the same OddsSnapshot rows when run in unified mode.",
        "Leg EV and trueProb come from the same calculateEvForMergedPicks / juice-aware path (no duplicate EV formulas in this policy).",
        "Neither this contract nor Phase 17J changes EV, breakeven, ranking, or payout math.",
        "Phase 17K: PP leg threshold stages execute via src/policy/runtime_decision_pipeline.ts (runner and pp_engine aligned).",
        "Phase 17K/17N: UD leg filter executes via filterUdEvPicksCanonical (shared FCFS cap + udMinEdge gate; runner and ud_engine aligned).",
      ].sort(),
    },
    prizePicks: {
      ...pp,
      runnerLegEligibility: runner,
      ppEngineWrapper: engine,
      runnerVsEngineDivergence,
    },
    underdog: {
      ...ud,
      runnerLegEligibility: computeUdRunnerLegEligibility(args),
    },
    comparison: compareEligibilityPolicies(pp, ud),
  };
}

export function getEligibilityPolicyContractPaths(cwd: string): {
  dir: string;
  jsonPath: string;
  mdPath: string;
} {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, "latest_eligibility_policy_contract.json"),
    mdPath: path.join(dir, "latest_eligibility_policy_contract.md"),
  };
}

function sortedStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(sortedStringify).join(",")}]`;
  const keys = Object.keys(obj as object).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${sortedStringify((obj as Record<string, unknown>)[k])}`);
  return `{${parts.join(",")}}`;
}

/** Deterministic markdown: sections in required order, bullets sorted where applicable. */
export function formatEligibilityPolicyContractMarkdown(contract: EligibilityPolicyContract): string {
  const lines: string[] = [];
  lines.push(`# Eligibility Policy Contract`);
  lines.push(``);
  lines.push(`## 1. Generated timestamp`);
  lines.push(`- UTC: ${contract.generatedAtUtc}`);
  lines.push(`- schemaVersion: ${contract.schemaVersion}`);
  lines.push(``);

  lines.push(`## 2. Shared policy`);
  for (const s of [...contract.shared.invariants].sort()) {
    lines.push(`- ${s}`);
  }
  lines.push(``);

  lines.push(`## 3. PrizePicks-only policy`);
  lines.push(`- runtimeSource: ${contract.prizePicks.runtimeSource}`);
  lines.push(`- runnerLegEligibility: ${sortedStringify(contract.prizePicks.runnerLegEligibility)}`);
  lines.push(`- legGates: ${sortedStringify(contract.prizePicks.legGates)}`);
  lines.push(`- cardConstructionGates: ${sortedStringify(contract.prizePicks.cardConstructionGates)}`);
  lines.push(`- exportAndRanking: ${sortedStringify(contract.prizePicks.exportAndRanking)}`);
  lines.push(`- ppEngineWrapper: ${sortedStringify(contract.prizePicks.ppEngineWrapper)}`);
  lines.push(`- runnerVsEngineDivergence: ${contract.prizePicks.runnerVsEngineDivergence}`);
  lines.push(`- stageOrder:`);
  for (const st of contract.prizePicks.stageOrder) lines.push(`  - ${st}`);
  for (const n of [...contract.prizePicks.ancillaryNotes].sort()) lines.push(`- note: ${n}`);
  lines.push(``);

  lines.push(`## 4. Underdog-only policy`);
  lines.push(`- runtimeSource: ${contract.underdog.runtimeSource}`);
  lines.push(`- runnerLegEligibility: ${sortedStringify(contract.underdog.runnerLegEligibility)}`);
  lines.push(`- legGates: ${sortedStringify(contract.underdog.legGates)}`);
  lines.push(`- cardConstructionGates: ${sortedStringify(contract.underdog.cardConstructionGates)}`);
  lines.push(`- exportAndRanking: ${sortedStringify(contract.underdog.exportAndRanking)}`);
  lines.push(`- stageOrder:`);
  for (const st of contract.underdog.stageOrder) lines.push(`  - ${st}`);
  for (const n of [...contract.underdog.ancillaryNotes].sort()) lines.push(`- note: ${n}`);
  lines.push(``);

  const review = contract.comparison.filter((c) => c.classification === "platform_specific_needs_review");
  lines.push(`## 5. Differences requiring review`);
  if (review.length === 0) {
    lines.push(`- (none — all differences are classified shared or approved platform-specific)`);
  } else {
    for (const r of [...review].sort((a, b) => a.key.localeCompare(b.key))) {
      lines.push(
        `- key=${r.key} relation=${r.relation} pp=${JSON.stringify(r.ppValue)} ud=${JSON.stringify(r.udValue)} — ${r.rationale}`
      );
    }
  }
  lines.push(``);

  lines.push(`## 6. Notes`);
  lines.push(`- Full comparison (all classifications):`);
  for (const r of [...contract.comparison].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(
      `  - [${r.classification}] ${r.key} (${r.relation}): pp=${JSON.stringify(r.ppValue)} ud=${JSON.stringify(r.udValue)}`
    );
  }
  if (contract.prizePicks.runnerVsEngineDivergence) {
    lines.push(
      `- pp_engine wrapper thresholds can diverge from run_optimizer when --volume is active — treat as needs_review until unified.`
    );
  }
  lines.push(`- Policy computations live in src/policy/eligibility_policy.ts (single normalization layer).`);
  lines.push(``);

  return lines.join("\n");
}

export function writeEligibilityPolicyContractArtifacts(cwd: string, args: CliArgs, generatedAtUtc: string): void {
  const contract = buildEligibilityPolicyContract(args, generatedAtUtc);
  const { dir, jsonPath, mdPath } = getEligibilityPolicyContractPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(contract, null, 2), "utf8");
  fs.writeFileSync(mdPath, formatEligibilityPolicyContractMarkdown(contract), "utf8");
}
