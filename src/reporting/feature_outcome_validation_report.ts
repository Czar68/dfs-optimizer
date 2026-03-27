/**
 * Phase 98 — Report / artifact for Phase 97 signal-vs-outcome validation (read-only; no optimizer or grading changes).
 */
import fs from "fs";
import path from "path";
import type { EvPick } from "../types";
import {
  evaluateSignalPerformance,
  type SignalPerformanceReport,
} from "../feature_input/feature_outcome_validation";
import { stableStringifyForObservability } from "./final_selection_observability";

export const FEATURE_OUTCOME_VALIDATION_SCHEMA_VERSION = 1 as const;

const JSON_NAME = "latest_feature_outcome_validation.json";
const MD_NAME = "latest_feature_outcome_validation.md";

const AXIS_ORDER = [
  "minutes_signal",
  "usage_signal",
  "environment_signal",
  "defense_signal",
] as const;

const BUCKET_LABELS: Record<
  "overall" | "low_bucket" | "mid_bucket" | "high_bucket",
  string
> = {
  overall: "overall",
  low_bucket: "low [0, 0.33)",
  mid_bucket: "mid [0.33, 0.66)",
  high_bucket: "high [0.66, 1]",
};

export interface FeatureOutcomeValidationArtifact {
  schemaVersion: typeof FEATURE_OUTCOME_VALIDATION_SCHEMA_VERSION;
  generatedAtUtc: string;
  inputPickCount: number;
  /** Picks with **`featureSignals`** and **`gradedLegOutcome`** in hit|miss|push. */
  evaluationRowCount: number;
  bucketDefinitions: {
    low: string;
    mid: string;
    high: string;
  };
  note: string;
  performance: SignalPerformanceReport;
}

export function getFeatureOutcomeValidationPaths(cwd: string): {
  dir: string;
  jsonPath: string;
  mdPath: string;
} {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

function countEvaluationRows(picks: readonly EvPick[]): number {
  let n = 0;
  for (const p of picks) {
    if (p.featureSignals?.signals == null) continue;
    const g = p.gradedLegOutcome;
    if (g !== "hit" && g !== "miss" && g !== "push") continue;
    n += 1;
  }
  return n;
}

/** Runs **`evaluateSignalPerformance`** and wraps a versioned, stable payload. */
export function buildFeatureOutcomeValidationArtifact(
  picks: readonly EvPick[],
  generatedAtUtc: string
): FeatureOutcomeValidationArtifact {
  return {
    schemaVersion: FEATURE_OUTCOME_VALIDATION_SCHEMA_VERSION,
    generatedAtUtc,
    inputPickCount: picks.length,
    evaluationRowCount: countEvaluationRows(picks),
    bucketDefinitions: {
      low: "[0, 0.33)",
      mid: "[0.33, 0.66)",
      high: "[0.66, 1]",
    },
    note:
      "Read-only validation artifact; no optimizer or EV impact. Requires picks with featureSignals and gradedLegOutcome (hit|miss|push).",
    performance: evaluateSignalPerformance(picks),
  };
}

export function formatFeatureOutcomeValidationJson(artifact: FeatureOutcomeValidationArtifact): string {
  return stableStringifyForObservability(artifact);
}

export function formatFeatureOutcomeValidationMarkdown(artifact: FeatureOutcomeValidationArtifact): string {
  const lines: string[] = [];
  lines.push("# Feature outcome validation (read-only)");
  lines.push("");
  lines.push(`- **Schema:** ${artifact.schemaVersion}`);
  lines.push(`- **Generated (UTC):** ${artifact.generatedAtUtc}`);
  lines.push(`- **Input picks:** ${artifact.inputPickCount}`);
  lines.push(`- **Rows with signals + graded outcome:** ${artifact.evaluationRowCount}`);
  lines.push(`- **Note:** ${artifact.note}`);
  lines.push("");
  lines.push("## Bucket definitions");
  lines.push("");
  lines.push(`- **Low:** ${artifact.bucketDefinitions.low}`);
  lines.push(`- **Mid:** ${artifact.bucketDefinitions.mid}`);
  lines.push(`- **High:** ${artifact.bucketDefinitions.high}`);
  lines.push("");

  for (const axis of AXIS_ORDER) {
    lines.push(`## ${axis}`);
    lines.push("");
    const perf = artifact.performance[axis];
    const buckets: (keyof typeof BUCKET_LABELS)[] = [
      "overall",
      "low_bucket",
      "mid_bucket",
      "high_bucket",
    ];
    for (const b of buckets) {
      const row = perf[b];
      lines.push(
        `- **${BUCKET_LABELS[b]}:** count=${row.count}, hit_rate=${row.hit_rate.toFixed(6)}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function writeFeatureOutcomeValidationArtifacts(
  cwd: string,
  artifact: FeatureOutcomeValidationArtifact
): void {
  const { dir, jsonPath, mdPath } = getFeatureOutcomeValidationPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, formatFeatureOutcomeValidationJson(artifact), "utf8");
  fs.writeFileSync(mdPath, formatFeatureOutcomeValidationMarkdown(artifact), "utf8");
}
