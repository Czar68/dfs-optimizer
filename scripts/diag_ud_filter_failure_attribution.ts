/**
 * Phase AE — Read-only first-failure attribution for UD `filterUdEvPicksCanonical` gates.
 * Uses the same ingest/merge/EV path as `run_underdog_optimizer` (no card build, no artifact mutation).
 *
 * Run (match Phase AC):
 *   npx ts-node scripts/diag_ud_filter_failure_attribution.ts --platform ud --sports NBA --bankroll 700
 */
import "../src/load_env";
import path from "path";
import { parseArgs, setCliArgsForProcess, handleCliArgsEarlyExit } from "../src/cli_args";
import { calculateEvForMergedPicks } from "../src/calculate_ev";
import { mergeOddsWithPropsWithMetadata } from "../src/merge_odds";
import { fetchUnderdogRawProps } from "../src/fetch_underdog_props";
import { loadRawPicksJsonSnapshot, loadUnderdogPropsFromFile } from "../src/load_underdog_props";
import {
  udLegFirstFailureCode,
  UD_FAIL_FACTOR_LT1,
  UD_FAIL_MIN_EDGE,
  UD_FAIL_SHARED_MIN_EDGE,
  UD_FAIL_STANDARD_LEG_EV,
  UD_FAIL_BOOSTED_ADJ_EV,
  UD_PASS,
} from "../src/policy/runtime_decision_pipeline";
import type { RawPick, Sport } from "../src/types";

const cli = parseArgs(process.argv.slice(2));
handleCliArgsEarlyExit(cli);
setCliArgsForProcess(cli);

async function fetchUnderdogRawPropsWithLogging(sports: Sport[]): Promise<RawPick[]> {
  if (cli.udRawPicksJsonPath) {
    const picks = loadRawPicksJsonSnapshot(cli.udRawPicksJsonPath);
    console.log(`[UD] Pinned replay: ${picks.length} raw picks from ${cli.udRawPicksJsonPath}`);
    return picks;
  }
  const scrapedFilePath = path.join(process.cwd(), "underdog_props_scraped.json");
  const manualFilePath = path.join(process.cwd(), "underdog_manual_props.json");
  console.log("[UD] Checking for scraped props file...");
  const scrapedProps = await loadUnderdogPropsFromFile(scrapedFilePath, "scraped");
  if (scrapedProps.length > 0) {
    console.log(`[UD] Using ${scrapedProps.length} props from scraped file`);
    return scrapedProps;
  }
  console.log("[UD] No scraped file found, trying Underdog API...");
  try {
    const apiProps = await fetchUnderdogRawProps(sports);
    if (apiProps.length > 0) {
      console.log(`[UD] Loaded ${apiProps.length} props from Underdog API`);
      return apiProps;
    }
  } catch (e) {
    console.error("[UD] API fetch failed:", (e as Error).message);
  }
  const manualProps = await loadUnderdogPropsFromFile(manualFilePath, "manual");
  if (manualProps.length > 0) {
    console.log(`[UD] Using ${manualProps.length} props from manual file`);
    return manualProps;
  }
  return [];
}

async function main() {
  const sports = cli.sports;
  const rawProps = await fetchUnderdogRawPropsWithLogging(sports);
  const { odds: merged } = await mergeOddsWithPropsWithMetadata(rawProps, cli);
  const evPicks = calculateEvForMergedPicks(merged);
  const udOnly = evPicks.filter((p) => p.site === "underdog");

  /** UD_FAIL_MIN_EDGE = trueProb < UD_MIN_TRUE_PROB; UD_FAIL_SHARED_MIN_EDGE = leg.edge < udMinEdge (market-relative gate). */
  const counts: Record<string, number> = {
    [UD_FAIL_FACTOR_LT1]: 0,
    [UD_FAIL_SHARED_MIN_EDGE]: 0,
    [UD_FAIL_MIN_EDGE]: 0,
    [UD_FAIL_STANDARD_LEG_EV]: 0,
    [UD_FAIL_BOOSTED_ADJ_EV]: 0,
    [UD_PASS]: 0,
  };

  for (const p of udOnly) {
    const code = udLegFirstFailureCode(p, cli);
    counts[code] = (counts[code] ?? 0) + 1;
  }

  console.log(JSON.stringify({ rawProps: rawProps.length, merged: merged.length, evAll: evPicks.length, evUd: udOnly.length }, null, 0));
  console.log("first_failure_code\tcount");
  for (const k of Object.keys(counts).sort()) {
    console.log(`${k}\t${counts[k]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
