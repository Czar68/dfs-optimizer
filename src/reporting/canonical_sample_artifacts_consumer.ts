/**
 * Phase 22 — Read-only loader for committed `artifacts/samples/*.json` (dashboard / tooling / docs).
 */
import fs from "fs";

import { getCanonicalSampleArtifactPaths } from "./canonical_sample_artifacts";
import { parseCanonicalSampleArtifactsFromJson } from "./canonical_sample_artifacts_validate";

export { parseCanonicalSampleArtifactsFromJson, CanonicalSampleArtifactValidationError } from "./canonical_sample_artifacts_validate";

/**
 * Load and validate canonical sample artifacts from disk. Read-only (no writes).
 */
export function loadCanonicalSampleArtifactsReadOnly(cwd: string): ReturnType<typeof parseCanonicalSampleArtifactsFromJson> {
  const paths = getCanonicalSampleArtifactPaths(cwd);
  const required: Array<{ label: string; abs: string }> = [
    { label: "sample_cards_pp.json", abs: paths.sampleCardsPpPath },
    { label: "sample_cards_ud.json", abs: paths.sampleCardsUdPath },
    { label: "sample_summary.json", abs: paths.sampleSummaryPath },
  ];
  for (const { label, abs } of required) {
    if (!fs.existsSync(abs)) {
      throw new Error(`[canonical sample consumer] missing file ${label} at ${abs}`);
    }
  }

  let ppRaw: unknown;
  let udRaw: unknown;
  let summaryRaw: unknown;
  try {
    ppRaw = JSON.parse(fs.readFileSync(paths.sampleCardsPpPath, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`[canonical sample consumer] invalid JSON: sample_cards_pp.json — ${(e as Error).message}`);
  }
  try {
    udRaw = JSON.parse(fs.readFileSync(paths.sampleCardsUdPath, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`[canonical sample consumer] invalid JSON: sample_cards_ud.json — ${(e as Error).message}`);
  }
  try {
    summaryRaw = JSON.parse(fs.readFileSync(paths.sampleSummaryPath, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`[canonical sample consumer] invalid JSON: sample_summary.json — ${(e as Error).message}`);
  }

  return parseCanonicalSampleArtifactsFromJson(ppRaw, udRaw, summaryRaw);
}
