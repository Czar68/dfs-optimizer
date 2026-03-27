/**
 * Central path helpers and output filenames (PP/UD legs & cards at project root by default).
 * Optional OUTPUT_DIR overrides the directory for getOutputPath/getOutputDir (e.g. Python / CI).
 */

import path from "path";

export const DATA_DIR = "data";
export const ARTIFACTS_DIR = "artifacts";

export const UD_LEGS_JSON = "underdog-legs.json";
export const UD_LEGS_CSV = "underdog-legs.csv";
export const UD_CARDS_JSON = "underdog-cards.json";
export const UD_CARDS_CSV = "underdog-cards.csv";
export const TOP_LEGS_JSON = "top_legs.json";

function projectRoot(): string {
  return process.cwd();
}

/** Directory for UD JSON/CSV exports (defaults to cwd to match prizepicks-legs.csv layout). */
export function getOutputDir(): string {
  const env = process.env.OUTPUT_DIR?.trim();
  if (env) return path.resolve(env);
  return projectRoot();
}

export function getOutputPath(filename: string): string {
  return path.join(getOutputDir(), filename);
}

export function getDataPath(filename: string): string {
  return path.join(projectRoot(), DATA_DIR, filename);
}

export function getArtifactsPath(filename: string): string {
  return path.join(projectRoot(), ARTIFACTS_DIR, filename);
}
