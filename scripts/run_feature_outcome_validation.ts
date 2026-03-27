/**
 * Phase 99 — Explicit offline runner: JSON pick array → Phase 98 artifacts (no optimizer hook).
 *
 * Usage: `npx ts-node scripts/run_feature_outcome_validation.ts --input=<path> [--cwd=<dir>] [--generated-at=<ISO8601>]`
 *
 * **input** — required. JSON file containing an **array** of **`EvPick`** (must include **`featureSignals`** + **`gradedLegOutcome`** for non-empty evaluation rows).
 * **cwd** — optional; working directory for resolving relative **input** and for **`data/reports/`** output (default: `process.cwd()`).
 * **generated-at** — optional fixed timestamp for reproducible artifacts (default: current UTC ISO string).
 */
import fs from "fs";
import path from "path";
import type { EvPick } from "../src/types";
import {
  buildFeatureOutcomeValidationArtifact,
  writeFeatureOutcomeValidationArtifacts,
  getFeatureOutcomeValidationPaths,
} from "../src/reporting/feature_outcome_validation_report";

function usageLine(): string {
  return "Usage: npx ts-node scripts/run_feature_outcome_validation.ts --input=<path> [--cwd=<dir>] [--generated-at=<ISO8601>]";
}

export type ParsedRunnerArgs =
  | { ok: true; inputPath: string; cwd: string; generatedAtUtc: string }
  | { ok: false; message: string };

export function parseRunFeatureOutcomeValidationArgs(argv: string[]): ParsedRunnerArgs {
  let inputPath: string | undefined;
  let cwd = process.cwd();
  let generatedAtRaw: string | undefined;

  for (const a of argv) {
    if (a.startsWith("--input=")) inputPath = a.slice("--input=".length).trim();
    else if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
    else if (a.startsWith("--generated-at=")) generatedAtRaw = a.slice("--generated-at=".length).trim();
  }

  if (!inputPath) {
    return { ok: false, message: `${usageLine()}\nError: --input=<path> is required.` };
  }

  let generatedAtUtc: string;
  if (generatedAtRaw) {
    const t = Date.parse(generatedAtRaw);
    if (!Number.isFinite(t)) {
      return { ok: false, message: `Error: invalid --generated-at (not a valid ISO date): ${generatedAtRaw}` };
    }
    generatedAtUtc = new Date(t).toISOString();
  } else {
    generatedAtUtc = new Date().toISOString();
  }

  return { ok: true, inputPath, cwd, generatedAtUtc };
}

/** Load JSON array of picks; throws **`Error`** with a clear message on missing file, invalid JSON, or non-array. */
export function loadEvPicksJsonFile(absPath: string): EvPick[] {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Input file not found: ${absPath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(absPath, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`Invalid JSON in ${absPath}: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Expected JSON array of EvPick in ${absPath}, got ${typeof raw}`);
  }
  return raw as EvPick[];
}

export function resolveInputPath(cwd: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(cwd, inputPath);
}

function main(): void {
  const parsed = parseRunFeatureOutcomeValidationArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }

  const absIn = resolveInputPath(parsed.cwd, parsed.inputPath);
  let picks: EvPick[];
  try {
    picks = loadEvPicksJsonFile(absIn);
  } catch (e) {
    console.error(String((e as Error).message));
    process.exit(1);
  }

  const artifact = buildFeatureOutcomeValidationArtifact(picks, parsed.generatedAtUtc);
  writeFeatureOutcomeValidationArtifacts(parsed.cwd, artifact);

  const { jsonPath, mdPath } = getFeatureOutcomeValidationPaths(parsed.cwd);
  console.log(
    `[feature-outcome-validation] OK — input_picks=${artifact.inputPickCount} evaluation_rows=${artifact.evaluationRowCount}`
  );
  console.log(`  json: ${jsonPath}`);
  console.log(`  md:   ${mdPath}`);
  process.exit(0);
}

if (require.main === module) {
  main();
}
