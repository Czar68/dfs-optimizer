/**
 * Phase 118 — Historical / contextual feature coverage audit (read-only SSOT; no EV math changes).
 * Grounded inventory: code paths, docs, optional merge from `latest_historical_feature_registry.json`.
 */

import fs from "fs";
import path from "path";
import { stableStringifyForObservability } from "./final_selection_observability";
import type { HistoricalFeatureRegistryPayload } from "../modeling/historical_feature_registry";

export const HISTORICAL_FEATURE_COVERAGE_AUDIT_SCHEMA_VERSION = 1 as const;

const REPORTS = "data/reports";
const JSON_NAME = "latest_historical_feature_coverage_audit.json";
const MD_NAME = "latest_historical_feature_coverage_audit.md";

export type FeatureReadiness = "ready" | "partial" | "missing" | "unclear_legacy";

export interface FamilyCoverageRow {
  /** Stable slug for tests / dashboards */
  id: string;
  label: string;
  /** `ContextFeatureFamily` where applicable; `registry_only` for Phase 80 row families not mapped 1:1 */
  contextFamilyOrNote: string;
  readiness: FeatureReadiness;
  /** Grounded statements (module paths, doc refs, pipeline facts). */
  evidence: string[];
  /** Where inputs are expected to come from (not aspirational). */
  dataSources: string[];
  /** How far toward live cards / optimizer this reaches today. */
  consumption: "none" | "optimizer_hot_path" | "validation_export_only" | "reporting_only";
  gaps: string[];
}

export interface NextImplementationSlice {
  id: string;
  title: string;
  /** Bullet strings — must cite repo evidence only. */
  justification: string[];
  /** Narrow scope for the next phase. */
  scope: string;
  explicitNonGoals: string[];
}

export interface HistoricalFeatureCoverageAudit {
  schemaVersion: typeof HISTORICAL_FEATURE_COVERAGE_AUDIT_SCHEMA_VERSION;
  generatedAtUtc: string;
  summaryLine: string;
  taxonomyNote: string;
  registryArtifact: {
    pathRel: string;
    present: boolean;
    rowCount: number | null;
    marketGroups: number | null;
    sourcePath: string | null;
  };
  families: FamilyCoverageRow[];
  crossCutting: {
    featureInputContractPath: string;
    historicalRegistrySchemaPath: string;
    featureInputDocPath: string;
    optimizerAttachment: string;
    monteCarloAiNotes: string[];
  };
  nextImplementationSlice: NextImplementationSlice;
}

function staticInventory(): FamilyCoverageRow[] {
  return [
    {
      id: "rolling_form_binary",
      label: "Rolling form (binary hit rates)",
      contextFamilyOrNote: "rolling_form",
      readiness: "partial",
      evidence: [
        "`src/feature_input/rolling_form_features.ts` — `buildRollingFormBinaryFeatures` (L5/L10 from 0/1 priors).",
        "**Phase 120** — `buildRollingFormContextRecordsFromHistoricalRow` maps `HistoricalFeatureRow.formL5/10/20HitRate` + sample size + trend slope into `rolling_form` context records on validation export path.",
        "`src/modeling/historical_feature_registry.ts` — `formL5HitRate` / `formL10HitRate` / `formL20HitRate` from `perf_tracker` (same window idea; Phase 80).",
        "`docs/FEATURE_INPUT_LAYER.md` — aligned semantics; not wired to selection.",
      ],
      dataSources: ["Chronological 0/1 priors (feature_input)", "perf_tracker.jsonl + prior rows (registry export)"],
      consumption: "validation_export_only",
      gaps: ["Default `run_optimizer` / card paths do not call `attachFeatureContextToCard`.", "Parallel representations still exist (`rolling_form_features.ts` from raw binary chain vs historical-row mapping)."],
    },
    {
      id: "minutes_availability",
      label: "Minutes & availability",
      contextFamilyOrNote: "minutes_availability",
      readiness: "partial",
      evidence: [
        "`src/feature_input/minutes_availability_features.ts` — `buildMinutesAvailabilityFeatures` (L5/L10 avg, trend, DNP bucket).",
        "**Phase 128** — `buildMinutesAvailabilityRecordsFromHistoricalRow` bridges grounded historical rows into `minutes_availability` records on validation export path.",
        "`src/feature_input/feature_scoring.ts` — `minutes_signal` consumes this family only.",
      ],
      dataSources: [
        "Caller-supplied game log rows (`MinutesAvailabilityInput`); no fetch inside module.",
        "Grounded `HistoricalFeatureRow` fields (`formL5ScrapeStatMean`, `formL10ScrapeStatMean`, `formPriorSampleSize`) when `statNormalized=minutes`.",
      ],
      consumption: "validation_export_only",
      gaps: ["Bridge is conservative and minutes-stat-scoped; no broad injury/rotation modeling in this slice."],
    },
    {
      id: "game_environment",
      label: "Game environment (total, spread, implied)",
      contextFamilyOrNote: "game_environment",
      readiness: "partial",
      evidence: [
        "`src/feature_input/game_environment_features.ts` — pre-parsed totals/spread only.",
        "**Phase 129** — `buildGameEnvironmentRecordsFromHistoricalRow` bridges grounded historical game-context stress fields into `game_environment` records on validation export path.",
        "**Phase 130** — direct grounded `HistoricalFeatureRow.gameTotal` / `HistoricalFeatureRow.spread` are now mapped through existing `buildGameEnvironmentFeatures` outputs on validation export path.",
        "`src/feature_input/feature_scoring.ts` — `environment_signal` uses `game_environment` only.",
      ],
      dataSources: [
        "Pre-parsed `gameTotal` / `spread` passed by caller.",
        "Grounded `HistoricalFeatureRow` schedule fields (`daysRest`, `isBackToBack`, `playerGamesInLast4CalendarDays`) on validation export path.",
        "Grounded `HistoricalFeatureRow.gameTotal` / `spread` when present on source rows.",
      ],
      consumption: "validation_export_only",
      gaps: ["Rows without grounded totals/spread continue to emit only schedule-stress environment keys; no inference/fabrication."],
    },
    {
      id: "team_defense_context",
      label: "Team defense / opponent allowance",
      contextFamilyOrNote: "team_defense_context",
      readiness: "partial",
      evidence: [
        "`src/feature_input/team_defense_features.ts` — ranks + `composite_defense_score` when ranks present.",
        "`src/modeling/historical_feature_registry.ts` — `opponentDefRankForStat` via `src/matchups/opp_adjust.ts` static table (Phase 80).",
        "`src/reporting/feature_validation_export.ts` — may attach context via `attachFeatureContextToPick` on validation export path.",
      ],
      dataSources: ["nba_api-style ranks passed in", "Static NBA opponent table for registry extract"],
      consumption: "validation_export_only",
      gaps: ["Live optimizer legs do not populate defense ranks into `ContextFeatureRecord` by default."],
    },
    {
      id: "home_away_schedule_registry",
      label: "Home/away & schedule (tracker-backed)",
      contextFamilyOrNote: "home_away_split + schedule_rest (contract) vs registry columns",
      readiness: "partial",
      evidence: [
        "**Phase 119** — `buildScheduleHomeAwayContextRecords` (`schedule_home_away_context_features.ts`) + `feature_validation_export.ts` attach `ContextFeatureRecord`s when historical row or `PerfTrackerRow.homeAway` is present.",
        "`src/modeling/historical_feature_extract.ts` — fills `homeAway`, `daysRest`, `isBackToBack`, `playerGamesInLast4CalendarDays` on `HistoricalFeatureRow` when tracker/game data allows.",
        "Registry `missingnessByFamily` notes: `homeAway` only when present on tracker row; `daysRest` needs prior game.",
      ],
      dataSources: ["perf_tracker row fields + chronological prior rows"],
      consumption: "validation_export_only",
      gaps: ["Default optimizer run does not call `attachFeatureContextToPick` — only feature-validation export path."],
    },
    {
      id: "matchup_context",
      label: "Matchup context",
      contextFamilyOrNote: "matchup_context",
      readiness: "partial",
      evidence: [
        "**Phase 126** — `buildMatchupContextRecordsFromHistoricalRow` maps grounded `HistoricalFeatureRow.opponentAbbrevResolved` and `opponentDefRankForStat` into `matchup_context` records on validation export path.",
        "Fields are source-aligned with `historical_feature_extract.ts` / Phase 80 registry; no new external feeds added in this slice.",
      ],
      dataSources: ["`HistoricalFeatureRow` opponent-context fields from perf_tracker-derived extraction"],
      consumption: "validation_export_only",
      gaps: ["Minimal foundation only; broader matchup dimensions are intentionally deferred."],
    },
    {
      id: "market_context_registry",
      label: "Market / line movement (tracker fields)",
      contextFamilyOrNote: "market_context",
      readiness: "partial",
      evidence: [
        "`HistoricalFeatureRow` — `openImpliedProb`, `closeImpliedProb`, `clvDelta`, `clvPct`, `oddsBucket` (Phase 80).",
        "**Phase 125** — `buildMarketContextRecordsFromHistoricalRow` maps market fields into `ContextFeatureRecord` rows on validation export path.",
        "**Phase 131** — market-context validation/export records aligned to dedicated `family: market_context` in the feature-input contract.",
        "Phase 80 family doc: fields already on PerfTrackerRow; no new snapshot fetches in Phase 80 export.",
      ],
      dataSources: ["perf_tracker columns"],
      consumption: "validation_export_only",
      gaps: ["Validation/export alignment complete; broader taxonomy unification between ContextFeatureFamily and HistoricalFeatureRow families remains incremental."],
    },
    {
      id: "role_stability",
      label: "Role stability / usage trends",
      contextFamilyOrNote: "other (placeholder)",
      readiness: "partial",
      evidence: [
        "**Phase 127** — `buildRoleStabilityRecordsFromHistoricalRow` maps grounded role fields into `ContextFeatureRecord` rows on validation export path.",
        "`HistoricalFeatureRow.roleMinutesTrend` stays nullable; mapper conservatively emits only finite values plus `roleStabilityNote` when present.",
      ],
      dataSources: ["`HistoricalFeatureRow.roleMinutesTrend`", "`HistoricalFeatureRow.roleStabilityNote`"],
      consumption: "validation_export_only",
      gaps: ["High-confidence minimal foundation only; no minutes/usage time-series enrichment in this slice."],
    },
    {
      id: "historical_registry_export",
      label: "Historical feature registry export (Phase 80)",
      contextFamilyOrNote: "registry_only",
      readiness: "ready",
      evidence: [
        "`npm run export:historical-feature-registry` → `data/reports/latest_historical_feature_registry.json` + `artifacts/historical_feature_rows.jsonl`.",
        "`src/modeling/historical_feature_extract.ts` builds coverage + sample rows.",
      ],
      dataSources: ["data/perf_tracker.jsonl"],
      consumption: "reporting_only",
      gaps: ["Not consumed by `trueProb` / edge / gating (per Phase 80 contract)."],
    },
    {
      id: "feature_validation_attachment",
      label: "Feature attachment on validation export",
      contextFamilyOrNote: "attach_context_features",
      readiness: "partial",
      evidence: [
        "`src/reporting/feature_validation_export.ts` — `attachFeatureContextToPick` on exported `EvPick`s when context records are built.",
        "Default `run_optimizer` does not attach (`run_optimizer.ts` comment Phase 95).",
      ],
      dataSources: ["Joined legs + optional defense context"],
      consumption: "validation_export_only",
      gaps: ["Live cards from optimizer typically lack `featureSnapshot` / `featureSignals`."],
    },
  ];
}

function readRegistrySummary(cwd: string): HistoricalFeatureCoverageAudit["registryArtifact"] {
  const pathRel = `${REPORTS}/latest_historical_feature_registry.json`;
  const full = path.join(cwd, pathRel);
  if (!fs.existsSync(full)) {
    return {
      pathRel,
      present: false,
      rowCount: null,
      marketGroups: null,
      sourcePath: null,
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(full, "utf8")) as HistoricalFeatureRegistryPayload;
    return {
      pathRel,
      present: true,
      rowCount: typeof raw.rowCount === "number" ? raw.rowCount : null,
      marketGroups: typeof raw.marketGroups === "number" ? raw.marketGroups : null,
      sourcePath: typeof raw.sourcePath === "string" ? raw.sourcePath : null,
    };
  } catch {
    return {
      pathRel,
      present: true,
      rowCount: null,
      marketGroups: null,
      sourcePath: null,
    };
  }
}

function nextSlice(): NextImplementationSlice {
  return {
    id: "role_stability_family_taxonomy_alignment",
    title: "Align role-stability records with dedicated family taxonomy",
    justification: [
      "`market_context` validation/export records are now aligned to dedicated `family: market_context`.",
      "`role_stability` validation/export records still use `family: other` placeholder semantics.",
      "This remains consistent with the one-slice reporting-first expansion model.",
    ],
    scope:
      "Add one narrow alignment pass for role-stability validation/export records to use a dedicated family only where contracts support it, with docs/audit/tests updates.",
    explicitNonGoals: [
      "No changes to `math_models/` or selection/gating.",
      "No requirement to alter odds snapshot ingestion or tracker writes.",
    ],
  };
}

export function buildHistoricalFeatureCoverageAudit(input: { generatedAtUtc: string; cwd: string }): HistoricalFeatureCoverageAudit {
  const registryArtifact = readRegistrySummary(input.cwd);
  const families = staticInventory();
  const taxonomyNote =
    "Two taxonomies coexist: (1) `ContextFeatureFamily` + `src/feature_input/*` builders for live `ContextFeatureRecord` paths; " +
    "(2) Phase 80 `HistoricalFeatureRow` + `HISTORICAL_FEATURE_FAMILIES` for backtest/registry export from `perf_tracker`. " +
    "They are related but not automatically unified — see `docs/FEATURE_INPUT_LAYER.md` and `src/modeling/historical_feature_registry.ts`.";

  const summaryLine =
    `historical_feature_coverage_audit families=${families.length} registry_present=${registryArtifact.present ? 1 : 0}` +
    (registryArtifact.rowCount != null ? ` registry_rows=${registryArtifact.rowCount}` : "");

  return {
    schemaVersion: HISTORICAL_FEATURE_COVERAGE_AUDIT_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    summaryLine,
    taxonomyNote,
    registryArtifact,
    families,
    crossCutting: {
      featureInputContractPath: "src/feature_input/context_feature_contract.ts",
      historicalRegistrySchemaPath: "src/modeling/historical_feature_registry.ts",
      featureInputDocPath: "docs/FEATURE_INPUT_LAYER.md",
      optimizerAttachment:
        "Optional `attachFeatureContextToCard` / `attachFeatureContextToPick` — default optimizer does not attach (see `run_optimizer.ts` Phase 95 comment).",
      monteCarloAiNotes: [
        "No dedicated AI or Monte Carlo *feature* pipeline under `src/feature_input/`; 'simulation' strings in reporting refer to threshold/diagnostic scripts (e.g. market-edge alignment), not learned features.",
      ],
    },
    nextImplementationSlice: nextSlice(),
  };
}

export function formatHistoricalFeatureCoverageMarkdown(a: HistoricalFeatureCoverageAudit): string {
  const lines: string[] = [];
  lines.push("# Historical feature coverage audit (Phase 118)");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${a.generatedAtUtc}`);
  lines.push(`- **Summary:** ${a.summaryLine}`);
  lines.push("");
  lines.push("## Taxonomy");
  lines.push(a.taxonomyNote);
  lines.push("");
  lines.push("## Registry artifact");
  lines.push(
    `- **${a.registryArtifact.pathRel}** — present=${a.registryArtifact.present}` +
      (a.registryArtifact.rowCount != null ? ` rows=${a.registryArtifact.rowCount}` : "") +
      (a.registryArtifact.marketGroups != null ? ` marketGroups=${a.registryArtifact.marketGroups}` : "")
  );
  lines.push("");
  lines.push("## Cross-cutting");
  lines.push(`- **Contract:** \`${a.crossCutting.featureInputContractPath}\``);
  lines.push(`- **Registry schema:** \`${a.crossCutting.historicalRegistrySchemaPath}\``);
  lines.push(`- **Docs:** \`${a.crossCutting.featureInputDocPath}\``);
  lines.push(`- **Optimizer attachment:** ${a.crossCutting.optimizerAttachment}`);
  for (const n of a.crossCutting.monteCarloAiNotes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  lines.push("## Family inventory");
  for (const f of a.families) {
    lines.push(`### ${f.label} (\`${f.id}\`)`);
    lines.push(`- **Readiness:** ${f.readiness}`);
    lines.push(`- **Context / note:** ${f.contextFamilyOrNote}`);
    lines.push(`- **Consumption:** ${f.consumption}`);
    lines.push("- **Evidence:**");
    for (const e of f.evidence) lines.push(`  - ${e}`);
    if (f.dataSources.length) {
      lines.push("- **Data sources:**");
      for (const d of f.dataSources) lines.push(`  - ${d}`);
    }
    if (f.gaps.length) {
      lines.push("- **Gaps:**");
      for (const g of f.gaps) lines.push(`  - ${g}`);
    }
    lines.push("");
  }
  lines.push("## Recommended next implementation slice");
  lines.push(`- **ID:** \`${a.nextImplementationSlice.id}\``);
  lines.push(`- **Title:** ${a.nextImplementationSlice.title}`);
  lines.push("- **Justification:");
  for (const j of a.nextImplementationSlice.justification) lines.push(`  - ${j}`);
  lines.push(`- **Scope:** ${a.nextImplementationSlice.scope}`);
  lines.push("- **Explicit non-goals:");
  for (const ng of a.nextImplementationSlice.explicitNonGoals) lines.push(`  - ${ng}`);
  lines.push("");
  return lines.join("\n");
}

export function writeHistoricalFeatureCoverageAuditArtifacts(rootDir: string, audit: HistoricalFeatureCoverageAudit): void {
  const dir = path.join(rootDir, REPORTS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, JSON_NAME), stableStringifyForObservability(audit), "utf8");
  fs.writeFileSync(path.join(dir, MD_NAME), `${formatHistoricalFeatureCoverageMarkdown(audit)}\n`, "utf8");
}
