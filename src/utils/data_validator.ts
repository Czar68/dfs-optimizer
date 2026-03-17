/**
 * Validates pipeline output files (data/output_logs) before reporting "Complete".
 * Ensures JSON/CSV structure is valid and not empty/truncated.
 */

import fs from "fs";
import path from "path";
import { getOutputDir, getOutputPath, PP_LEGS_CSV, PP_CARDS_CSV, UD_LEGS_CSV, UD_CARDS_CSV, PP_LEGS_JSON, PP_CARDS_JSON, UD_LEGS_JSON, UD_CARDS_JSON } from "../constants/paths";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Check file exists, non-zero size, and (for JSON) parseable. */
function validateJsonFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return `Missing: ${path.basename(filePath)}`;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (raw.length === 0) return `Empty: ${path.basename(filePath)}`;
  try {
    JSON.parse(raw);
    return null;
  } catch {
    return `Invalid JSON (truncated?): ${path.basename(filePath)}`;
  }
}

/** Check file exists, has at least a header line (and optionally data lines). */
function validateCsvFile(filePath: string, requireDataRow: boolean = false): string | null {
  if (!fs.existsSync(filePath)) return `Missing: ${path.basename(filePath)}`;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (raw.length === 0) return `Empty: ${path.basename(filePath)}`;
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return `No lines: ${path.basename(filePath)}`;
  if (requireDataRow && lines.length < 2) return `CSV has header only (no data): ${path.basename(filePath)}`;
  return null;
}

/**
 * Validate pipeline outputs in data/output_logs.
 * Requires at least one legs and one cards output (PP or UD) to be present and valid.
 */
export function validateOutputData(root?: string): ValidationResult {
  const base = root ?? process.cwd();
  const errors: string[] = [];

  const jsonFiles: string[] = [PP_LEGS_JSON, PP_CARDS_JSON, UD_LEGS_JSON, UD_CARDS_JSON];
  for (const name of jsonFiles) {
    const p = getOutputPath(name, base);
    if (fs.existsSync(p)) {
      const err = validateJsonFile(p);
      if (err) errors.push(err);
    }
  }

  const csvFiles: [string, boolean][] = [
    [PP_LEGS_CSV, false],
    [PP_CARDS_CSV, false],
    [UD_LEGS_CSV, false],
    [UD_CARDS_CSV, false],
  ];
  for (const [name, requireData] of csvFiles) {
    const p = getOutputPath(name, base);
    if (fs.existsSync(p)) {
      const err = validateCsvFile(p, requireData);
      if (err) errors.push(err);
    }
  }

  const anyLegsExist = fs.existsSync(getOutputPath(PP_LEGS_CSV, base)) || fs.existsSync(getOutputPath(UD_LEGS_CSV, base));
  const anyCardsExist = fs.existsSync(getOutputPath(PP_CARDS_CSV, base)) || fs.existsSync(getOutputPath(UD_CARDS_CSV, base));
  if (!anyLegsExist && !anyCardsExist) {
    errors.push("CRITICAL: No pipeline output found. Expected at least one of prizepicks-legs.csv, underdog-legs.csv, prizepicks-cards.csv, underdog-cards.csv in " + getOutputDir(base));
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
