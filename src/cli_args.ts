// src/cli_args.ts
// CLI argument parsing for odds fetching control

import { Sport } from "./types";
import { OddsRefreshMode } from "./odds/odds_snapshot";

export interface CliArgs {
  noFetchOdds: boolean;     // --no-fetch-odds / --use-cache-only
  forceRefreshOdds: boolean; // --force-refresh-odds
  refreshIntervalMinutes: number; // --refresh-interval-minutes
  sports: Sport[];          // --sports (comma-separated list, default: NBA)
  minEdge: number | null;   // --min-edge <fraction> overrides MIN_EDGE_PER_LEG
  minEv: number | null;     // --min-ev <fraction> overrides MIN_LEG_EV
  date: string | null;      // --date YYYY-MM-DD overrides run date in CSV output
  innovative: boolean;      // --innovative  run innovative card builder (diversity+Kelly portfolio)
  liveLiq: boolean;         // --live-liq    optional liquidity scoring (default heuristic when disabled)
  telegram: boolean;        // --telegram    push top-5 innovative cards to Telegram bot
  exactLine: boolean;       // --exact-line  require pick.line == odds line (no ±1 fuzzy)
  maxJuice: number | null;  // --max-juice <num> override PP_MAX_JUICE (default 180)
  minCardEv: number | null; // --min-card-ev <num> override MIN_CARD_EV (default null → sport-specific)
  udMinEv: number | null;   // --ud-min-ev <num> UD leg EV floor (default 0.012 when running UD)
  bankroll: number;         // --bankroll <num> bankroll for Kelly stake sizing (default env BANKROLL or 1000); use cliArgs.bankroll everywhere
  kellyFraction: number;    // --kelly-fraction <num> Kelly multiplier 0-1 (default 0.5 = half-Kelly)
  maxBetPerCard: number;    // --max-bet-per-card <num> absolute cap on any single card wager
  platform: 'pp' | 'ud' | 'both';  // --platform pp|ud|both (single binary)
  providers: string[];             // --providers "PP,UD" (leg sources; default PP,UD when both)
  mockLegs: number | null;  // --mock-legs N inject N synthetic legs for testing
  udVolume: boolean;       // --ud-volume looser UD feasibility + lower leg EV floor
  maxExport: number;      // --max-export N cap PP cards CSV/JSON (default 500); tier1/tier2 always full
  exportUncap: boolean;   // --export-uncap no cap on PP cards export (tier1/tier2 still full)
  daily: boolean;         // --daily shorthand: fresh + telegram + bankroll=600 + platform both
  maxCards: number;       // --max-cards N post-EV cap per site (default 400); used for PP export + UD cap when platform both
  maxPlayerExposure: number; // --max-player-exposure <0-1> global player cap (default 0.05 = 5%)
  debug: boolean;         // --debug verbose funnel + diagnostic output
  debugPipeline: boolean; // --debug-pipeline log RUN MODE COMPARE + sheets audit
  help: boolean;            // --help / -h
  // Phase 8 EV tweaks
  juiceAware: boolean;      // --juice-aware use juice-corrected leg BE (default: true)
  oppAdjust: boolean;       // --opp-adjust apply opponent defensive rank shift (default: true)
  corrAdjust: boolean;      // --corr-adjust apply combo stat coherence (default: true)
  noTweaks: boolean;        // --no-tweaks disable ALL Phase 8 adjustments
  // Odds snapshot control
  oddsRefresh: OddsRefreshMode;   // --odds-refresh live|cache|auto (default: auto)
  oddsMaxAgeMin: number;          // --odds-max-age-min (minutes; auto→live when snapshot older, default 120)
  // Alt-line control
  includeAltLines: boolean;       // --include-alt-lines / --sgo-include-alt-lines / --no-alt-lines (default: true)
  requireAltLines: boolean;       // --require-alt-lines / --no-require-alt-lines (default: true)
  // Effective-config only (exit after printing)
  printEffectiveConfig: boolean; // --print-effective-config
  printBestEv: boolean; // --print-best-ev output top 3 card structures per platform (registry-based EV)
  // Guardrails: hard-fail if odds stale, merge too low, or no +EV legs (set false with --no-guardrails for debug)
  noGuardrails: boolean; // --no-guardrails (default: false = guardrails on)
  // Production emergency flags
  volume: boolean;          // --volume aggressive thresholds (minEdge=0.004, minLegEv=0.004, maxLegsPerPlayer=2)
  noSheets: boolean;        // --no-sheets skip sheets_push.py entirely
  sheetsOnly: boolean;      // --sheets-only push to Sheets using last cached CSVs only (no fetch/merge/cards)
  telegramDryRun: boolean;  // --telegram-dry-run log message to console, don't send
  forceUd: boolean;         // --force-ud always run UD even if PP fails/has few legs
}

const DEFAULT_REFRESH_INTERVAL_MINUTES = 15;

/** True when the process was started as run_optimizer.js, run_underdog_optimizer.js, or run-generate.js (strict mode). */
function isOptimizerEntryPoint(): boolean {
  const exe = typeof process.argv[1] === "string" ? process.argv[1] : "";
  return exe.includes("run_optimizer") || exe.includes("run_underdog") || exe.includes("run-generate");
}

/**
 * @param overrideArgv - If provided, use instead of process.argv.slice(2) (for tests).
 */
function parseArgs(overrideArgv?: string[]): CliArgs {
  const args = overrideArgv ?? process.argv.slice(2);
  const strict = overrideArgv !== undefined || isOptimizerEntryPoint();
  
  const result: CliArgs = {
    noFetchOdds: false,
    forceRefreshOdds: false,
    refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
    sports: ['NBA'], // Default to NBA only
    minEdge: null,
    minEv: null,
    date: null,
    innovative: false,
    liveLiq: false,
    telegram: false,
    exactLine: false,
    maxJuice: null,
    minCardEv: null,
    udMinEv: null,
    bankroll: 600,
    kellyFraction: 0.5,
    maxBetPerCard: Infinity,
    platform: 'pp',
    providers: [], // Set in validation from platform when not explicitly passed
    mockLegs: null,
    udVolume: false,
    maxExport: 500,
    exportUncap: false,
    daily: false,
    maxCards: 400,
    maxPlayerExposure: 0.05,
    debug: false,
    debugPipeline: false,
    help: false,
    juiceAware: true,
    oppAdjust: true,
    corrAdjust: true,
    noTweaks: false,
    oddsRefresh: "auto" as OddsRefreshMode,
    oddsMaxAgeMin: 120,
    includeAltLines: true,
    requireAltLines: true,
    printEffectiveConfig: false,
    printBestEv: false,
    noGuardrails: false,
    volume: false,
    noSheets: false,
    sheetsOnly: false,
    telegramDryRun: false,
    forceUd: false,
  };

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    // BANKROLL: parse first so CLI always wins (no env 10000)
    if (arg === "--bankroll" || arg.startsWith("--bankroll=")) {
      const v = arg.startsWith("--bankroll=") ? arg.slice("--bankroll=".length) : args[i + 1];
      if (v && v !== "" && !v.startsWith("--")) {
        const parsed = parseInt(v, 10);
        if (!isNaN(parsed) && parsed > 0) {
          result.bankroll = parsed;
          if (arg === "--bankroll") i++;
        } else {
          console.error("Error: --bankroll requires a positive integer (e.g. 600).");
          process.exit(2);
        }
      } else {
        console.error("Error: --bankroll requires a value (e.g. --bankroll 600 or --bankroll=600).");
        process.exit(2);
      }
      continue;
    }

    switch (arg) {
      case "--no-fetch-odds":
      case "--use-cache-only":
        result.noFetchOdds = true;
        break;
        
      case "--force-refresh-odds":
        result.forceRefreshOdds = true;
        break;

      // --fresh / --no-cache: shorthand for --force-refresh-odds
      case "--fresh":
      case "--no-cache":
        result.forceRefreshOdds = true;
        result.oddsRefresh = "live" as OddsRefreshMode;
        break;

      case "--sports":
        const sportsArg = args[i + 1];
        if (sportsArg && !sportsArg.startsWith("--")) {
          const sportsList = sportsArg.split(',').map(s => s.trim().toUpperCase());
          const validSports: Sport[] = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB', 'NCAAF'];
          const invalidSports = sportsList.filter(s => !validSports.includes(s as Sport));
          
          if (invalidSports.length > 0) {
            console.error(`Error: Invalid sports "${invalidSports.join(', ')}". Valid sports: ${validSports.join(', ')}`);
            process.exit(2);
          }
          
          result.sports = sportsList as Sport[];
          i++; // Skip the next argument since we consumed it
        } else {
          console.error('Error: --sports requires a comma-separated list of sports.');
          process.exit(2);
        }
        break;
        
      case "--refresh-interval-minutes":
        const intervalArg = args[i + 1];
        if (intervalArg && !intervalArg.startsWith("--")) {
          const parsed = parseInt(intervalArg, 10);
          if (!isNaN(parsed) && parsed > 0) {
            result.refreshIntervalMinutes = parsed;
            i++; // Skip the next argument since we consumed it
          } else {
            console.error(`Error: Invalid refresh interval "${intervalArg}". Must be a positive number.`);
            process.exit(2);
          }
        } else {
          console.error('Error: --refresh-interval-minutes requires a numeric value.');
          process.exit(2);
        }
        break;
        
      case "--min-edge": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0) {
            result.minEdge = parsed;
            i++;
          } else {
            console.error(`Error: --min-edge requires a non-negative number (e.g. 0.01 for 1%).`);
            process.exit(2);
          }
        } else {
          console.error('Error: --min-edge requires a numeric value.');
          process.exit(2);
        }
        break;
      }

      case "--min-ev": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0) {
            result.minEv = parsed;
            i++;
          } else {
            console.error(`Error: --min-ev requires a non-negative number (e.g. 0.01 for 1%).`);
            process.exit(2);
          }
        } else {
          console.error('Error: --min-ev requires a numeric value.');
          process.exit(2);
        }
        break;
      }

      case "--date": {
        const v = args[i + 1];
        if (v && !v.startsWith("--") && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          result.date = v;
          i++;
        } else {
          console.error('Error: --date requires a YYYY-MM-DD value (e.g. 2026-02-21).');
          process.exit(2);
        }
        break;
      }

      case "--exact-line":
        result.exactLine = true;
        break;

      case "--min-card-ev": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0) { result.minCardEv = parsed; i++; }
          else { console.error("Error: --min-card-ev requires a non-negative number (e.g. 0.015)."); process.exit(2); }
        } else { console.error("Error: --min-card-ev requires a numeric value."); process.exit(2); }
        break;
      }

      case "--ud-min-ev": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0) { result.udMinEv = parsed; i++; }
          else { console.error("Error: --ud-min-ev requires a non-negative number (e.g. 0.012)."); process.exit(2); }
        } else { console.error("Error: --ud-min-ev requires a numeric value."); process.exit(2); }
        break;
      }

      case "--kelly-fraction": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) { result.kellyFraction = parsed; i++; }
          else { console.error("Error: --kelly-fraction must be between 0 and 1."); process.exit(2); }
        } else { console.error("Error: --kelly-fraction requires a numeric value."); process.exit(2); }
        break;
      }

      case "--max-bet-per-card": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed > 0) { result.maxBetPerCard = parsed; i++; }
          else { console.error("Error: --max-bet-per-card requires a positive number."); process.exit(2); }
        } else { console.error("Error: --max-bet-per-card requires a numeric value."); process.exit(2); }
        break;
      }

      case "--max-juice": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed > 0) {
            result.maxJuice = parsed;
            i++;
          } else {
            console.error("Error: --max-juice requires a positive integer (e.g. 180).");
            process.exit(2);
          }
        } else {
          console.error("Error: --max-juice requires a numeric value.");
          process.exit(2);
        }
        break;
      }

      case "--innovative":
        result.innovative = true;
        break;

      case "--live-liq":
        result.liveLiq = true;
        result.innovative = true; // live-liq implies --innovative
        break;

      case "--telegram":
        result.telegram = true;
        result.innovative = true; // --telegram implies --innovative
        break;

      case "--platform": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const p = v.toLowerCase();
          if (p === "pp" || p === "ud" || p === "both") {
            result.platform = p;
            i++;
          } else {
            console.error("Error: --platform must be pp, ud, or both.");
            process.exit(2);
          }
        } else {
          console.error("Error: --platform requires pp, ud, or both.");
          process.exit(2);
        }
        break;
      }

      case "--mock-legs": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
            result.mockLegs = parsed;
            i++;
          } else {
            console.error("Error: --mock-legs requires an integer 1–30.");
            process.exit(2);
          }
        } else {
          console.error("Error: --mock-legs requires a numeric value.");
          process.exit(2);
        }
        break;
      }

      case "--providers": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const list = v.split(",").map((s) => s.trim().toUpperCase());
          const valid = ["PP", "UD"];
          const invalid = list.filter((s) => !valid.includes(s));
          if (invalid.length > 0) {
            console.error(`Error: Invalid --providers "${invalid.join(", ")}". Valid: ${valid.join(", ")}`);
            process.exit(2);
          }
          result.providers = list;
          i++;
        } else {
          console.error("Error: --providers requires a comma-separated list (e.g. PP,UD).");
          process.exit(2);
        }
        break;
      }

      case "--ud-only":
        result.platform = "ud";
        break;

      case "--ud-volume":
        result.udVolume = true;
        break;

      case "--export-uncap":
        result.exportUncap = true;
        break;

      case "--daily":
        result.daily = true;
        result.forceRefreshOdds = true;
        result.oddsRefresh = "live" as OddsRefreshMode;
        result.telegram = true;
        result.innovative = true;
        result.bankroll = 600;
        result.platform = "both";
        result.maxCards = 400;
        result.maxPlayerExposure = 0.05;
        break;

      case "--max-export": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 10000) {
            result.maxExport = parsed;
            i++;
          } else {
            console.error("Error: --max-export requires an integer 1–10000.");
            process.exit(2);
          }
        } else {
          console.error("Error: --max-export requires a numeric value.");
          process.exit(2);
        }
        break;
      }

      case "--max-cards": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 2000) {
            result.maxCards = parsed;
            result.maxExport = parsed; // align PP export cap with max-cards when set
            i++;
          } else {
            console.error("Error: --max-cards requires an integer 1–2000.");
            process.exit(2);
          }
        } else {
          console.error("Error: --max-cards requires a numeric value.");
          process.exit(2);
        }
        break;
      }

      case "--max-player-exposure": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            result.maxPlayerExposure = parsed;
            i++;
          } else {
            console.error("Error: --max-player-exposure must be between 0 and 1 (e.g. 0.05 for 5%).");
            process.exit(2);
          }
        } else {
          console.error("Error: --max-player-exposure requires a numeric value.");
          process.exit(2);
        }
        break;
      }

      case "--debug":
      case "--debug-crash":
        result.debug = true;
        break;
      case "--debug-pipeline":
        result.debugPipeline = true;
        break;
      case "--safe":
        // Sheets push uses --safe by default; accept flag for npm run generate -- --safe
        break;

      case "--help":
      case "-h":
        result.help = true;
        break;

      case "--juice-aware":
        result.juiceAware = true;
        break;
      case "--no-juice":
        result.juiceAware = false;
        break;
      case "--opp-adjust":
        result.oppAdjust = true;
        break;
      case "--no-opp-adjust":
        result.oppAdjust = false;
        break;
      case "--corr-adjust":
        result.corrAdjust = true;
        break;
      case "--no-corr-adjust":
        result.corrAdjust = false;
        break;
      case "--no-tweaks":
        result.noTweaks = true;
        result.juiceAware = false;
        result.oppAdjust = false;
        result.corrAdjust = false;
        break;

      case "--include-alt-lines":
        result.includeAltLines = true;
        break;
      case "--no-alt-lines":
        result.includeAltLines = false;
        result.requireAltLines = false;
        break;
      case "--require-alt-lines":
        result.requireAltLines = true;
        break;
      case "--no-require-alt-lines":
        result.requireAltLines = false;
        break;

      case "--odds-refresh": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const mode = v.toLowerCase();
          if (mode === "live" || mode === "cache" || mode === "auto") {
            result.oddsRefresh = mode as OddsRefreshMode;
            i++;
          } else {
            console.error("Error: --odds-refresh must be live, cache, or auto.");
            process.exit(2);
          }
        } else {
          console.error("Error: --odds-refresh requires live, cache, or auto.");
          process.exit(2);
        }
        break;
      }

      case "--":
        // End of options (e.g. npm run generate -- --platform both)
        i = args.length;
        break;

      case "--min-edge-per-leg":
        // Alias for --min-edge
        if (args[i + 1] && !args[i + 1].startsWith("--")) {
          const v = args[i + 1];
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0) {
            result.minEdge = parsed;
            i++;
          } else {
            console.error("Error: --min-edge-per-leg requires a non-negative number (e.g. 0.01 for 1%).");
            process.exit(2);
          }
        } else {
          console.error("Error: --min-edge-per-leg requires a numeric value.");
          process.exit(2);
        }
        break;

      case "--min-leg-ev":
        // Alias for --min-ev
        if (args[i + 1] && !args[i + 1].startsWith("--")) {
          const v = args[i + 1];
          const parsed = parseFloat(v);
          if (!isNaN(parsed) && parsed >= 0) {
            result.minEv = parsed;
            i++;
          } else {
            console.error("Error: --min-leg-ev requires a non-negative number (e.g. 0.01 for 1%).");
            process.exit(2);
          }
        } else {
          console.error("Error: --min-leg-ev requires a numeric value.");
          process.exit(2);
        }
        break;

      case "--max-cards-per-tier":
        // Alias for --max-cards
        if (args[i + 1] && !args[i + 1].startsWith("--")) {
          const v = args[i + 1];
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 2000) {
            result.maxCards = parsed;
            result.maxExport = parsed;
            i++;
          } else {
            console.error("Error: --max-cards-per-tier requires an integer 1–2000.");
            process.exit(2);
          }
        } else {
          console.error("Error: --max-cards-per-tier requires a numeric value.");
          process.exit(2);
        }
        break;

      case "--odds-max-age-min": {
        const v = args[i + 1];
        if (v && !v.startsWith("--")) {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 10080) {
            result.oddsMaxAgeMin = parsed;
            i++;
          } else {
            console.error("Error: --odds-max-age-min must be an integer 1–10080 (minutes).");
            process.exit(2);
          }
        } else {
          console.error("Error: --odds-max-age-min requires a numeric value.");
          process.exit(2);
        }
        break;
      }

      case "--sgo-include-alt-lines":
        result.includeAltLines = true;
        break;

      case "--print-effective-config":
        result.printEffectiveConfig = true;
        break;

      case "--print-best-ev":
        result.printBestEv = true;
        break;

      case "--no-guardrails":
        result.noGuardrails = true;
        break;

      case "--volume":
        result.volume = true;
        if (result.minEdge === null) result.minEdge = 0.004;
        if (result.minEv === null)   result.minEv = 0.004;
        result.udVolume = true;
        result.noGuardrails = true;
        result.requireAltLines = false;
        result.maxCards = 800;
        result.maxExport = 800;
        break;

      case "--no-sheets":
        result.noSheets = true;
        break;

      case "--sheets-only":
        result.sheetsOnly = true;
        break;

      case "--telegram-dry-run":
        result.telegramDryRun = true;
        result.telegram = true;
        break;

      case "--force-ud":
        result.forceUd = true;
        break;

      default:
        if (strict) {
          console.error(`Error: Unknown argument "${arg}".`);
          process.exit(2);
        } else {
          console.warn(`Warning: Unknown argument "${arg}" ignored`);
          break;
        }
    }
  }

  // Validate conflicting arguments
  if (result.noFetchOdds && result.forceRefreshOdds) {
    console.error("Error: --no-fetch-odds is mutually exclusive with --force-refresh-odds.");
    process.exit(2);
  }

  // Default providers from platform when not explicitly set
  if (result.providers.length === 0) {
    if (result.platform === "both") {
      result.providers = ["PP", "UD"];
    } else if (result.platform === "ud") {
      result.providers = ["UD"];
    } else {
      result.providers = ["PP"];
    }
  }

  return result;
}

export { parseArgs };

/** Build resolved config (defaults + derived) for --print-effective-config. */
export function getEffectiveConfig(args: CliArgs): Record<string, unknown> {
  return {
    // Leg/card filters (effective values used by PP/UD)
    minEdgePerLeg: args.minEdge ?? 0.015,
    minLegEv: args.minEv ?? 0.020,
    minCardEv: args.minCardEv ?? null,
    udMinEv: args.udMinEv ?? null,
    maxCards: args.maxCards,
    maxCardsPerTier: args.maxCards,
    maxExport: args.maxExport,
    maxPlayerExposure: args.maxPlayerExposure,
    // Odds snapshot
    oddsRefresh: args.oddsRefresh,
    oddsMaxAgeMin: args.oddsMaxAgeMin,
    includeAltLines: args.includeAltLines,
    requireAltLines: args.requireAltLines,
    // Platform & bankroll
    platform: args.platform,
    bankroll: args.bankroll,
    kellyFraction: args.kellyFraction,
    maxBetPerCard: args.maxBetPerCard === Infinity ? null : args.maxBetPerCard,
    // Sports & providers
    sports: args.sports,
    providers: args.providers,
    // Flags
    innovative: args.innovative,
    debug: args.debug,
    debugPipeline: args.debugPipeline,
    exactLine: args.exactLine,
    noFetchOdds: args.noFetchOdds,
    forceRefreshOdds: args.forceRefreshOdds,
    volume: args.volume,
    noSheets: args.noSheets,
    sheetsOnly: args.sheetsOnly,
    telegramDryRun: args.telegramDryRun,
    forceUd: args.forceUd,
  };
}

export function printEffectiveConfig(): void {
  const config = getEffectiveConfig(cliArgs);
  console.log(JSON.stringify(config, null, 2));
}

export function showHelp(): void {
  console.log(`
Multi-Sport Props Optimizer - Odds Fetching Control

USAGE:
  node dist/run_optimizer.js [OPTIONS]   # unified binary (PP and/or UD)
  node dist/run_underdog_optimizer.js [OPTIONS]   # UD-only entry point

STRICT PARSING (when run as above):
  Unknown flags or missing values for options cause an error and exit code 2.
  Use --print-effective-config to see resolved config without running.

PLATFORM (unified binary):
  --platform pp|ud|both
        Run PrizePicks only (pp), Underdog only (ud), or both (both).
        Default: pp
  --ud-only
        Shorthand for --platform ud.

  --mock-legs <N>
        Inject N synthetic legs (1–30) for testing/e2e. Same legs used for PP and UD when --platform both.

  --ud-volume
        Looser UD feasibility (0.010 leg EV floor, half structure thresholds, 15% feasibility factor).

  --max-export <N>
        Cap PP cards export (prizepicks-cards.csv/json) to top N by EV (default 500). Tier1/Tier2 CSVs always full.

  --max-cards <N>
        Post-EV cap per site (default 400). When --platform both, caps both PP and UD exports. Also sets maxExport.

  --max-player-exposure <fraction>
        Global player cap 0–1 (default 0.05 = 5%). Phase 5 report flags players appearing in more than this share of cards.

  --debug
        Verbose funnel and diagnostic output (e.g. UD leg sample, adj-EV range).

  --export-uncap
        No cap on PP cards export (export all). Tier1/Tier2 CSVs still full.

  --daily
        Daily driver: --fresh + --telegram + bankroll=600 + --platform both.

  --providers <list>
        Comma-separated leg sources when --platform both. Default: PP,UD.
        Example: --providers PP,UD

SPORT SELECTION:
  --sports <list>
        Comma-separated list of sports to process.
        Default: NBA
        Valid: NBA, NFL, MLB, NHL, NCAAB, NCAAF
        Example: --sports NBA,NHL

ODDS FETCHING OPTIONS:
  --no-fetch-odds, --use-cache-only
        Use only cached odds, never fetch from APIs.
        Fails if no valid cache exists.

  --fresh, --no-cache
        Force refresh odds cache (equivalent to --force-refresh-odds).
        Use when stale data is returned despite a new date.

  --force-refresh-odds
        Force refresh merged-odds cache, ignoring TTL.

  --no-guardrails
        Disable hard-fail guardrails (debug only): skip odds age, PP/UD merge ratio, and no +EV legs checks.

  --refresh-interval-minutes <number>
        Set cache TTL / refresh interval in minutes.
        Default: 15 minutes.
        Must be a positive integer.

  --min-edge, --min-edge-per-leg <fraction>
        Minimum edge per leg (default: 0.015 = 1.5%). Example: --min-edge 0.01

  --min-ev, --min-leg-ev <fraction>
        Minimum leg EV (default: 0.020 = 2.0%). Example: --min-ev 0.01

  --max-cards, --max-cards-per-tier <N>
        Post-EV cap per site (default 400). Integer 1–2000.

  --odds-refresh live|cache|auto
        Odds snapshot: live (always fetch), cache (use disk), auto (live if older than --odds-max-age-min).
        Default: auto

  --odds-max-age-min <minutes>
        In auto mode, treat snapshot as stale after this many minutes (default 120).

  --sgo-include-alt-lines, --include-alt-lines
        Request alt lines from odds feed (default: true). Use --no-alt-lines to disable.

  --require-alt-lines, --no-require-alt-lines
        When true (default), fail NBA run if includeAltLines but 0 alts returned.

  --print-effective-config
        Print resolved config JSON (defaults + overrides) and exit 0 without running.

  --print-best-ev
        Print top 3 card structures per platform (PP/UD) by registry-based CardEV and exit.

  --date YYYY-MM-DD
        Override the date written to CSV runTimestamp column.
        Example: --date 2026-02-21

  --innovative
        Run the innovative card builder after standard cards.
        Generates prizepicks-innovative-cards.csv with composite scoring
        (EV × diversity × (1-correlation) × liquidity) and enforces
        portfolio-level player/stat caps + Kelly sizing.
        Adds edge-clusters.json with team+stat cluster report.

  --live-liq
        Optional live liquidity scoring (default heuristic when disabled).
        When enabled, attempts to compute a real-time
        liquidity score per leg when available.
        Implies --innovative. Outputs stat-balance-radar.svg.

  --telegram
        Push top-5 innovative cards to a Telegram bot after generation.
        Requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env.
        See: https://core.telegram.org/bots#how-do-i-create-a-bot
        Implies --innovative.

SHEETS:
  --no-sheets
        Skip pushing to Google Sheets (CSVs still written; import manually).
  --sheets-only
        Push to Sheets using last cached CSVs only (no odds fetch, merge, or card build).
        Use after a full run to re-push the same data (e.g. fix Legs/UD-Legs formulas).

  --help, -h
        Show this help message.

EXAMPLES:
  # Normal operation with NBA (default)
  ts-node src/run_optimizer.ts

  # Process NBA and NHL
  ts-node src/run_optimizer.ts --sports NBA,NHL

  # Process only NHL
  ts-node src/run_optimizer.ts --sports NHL

  # Push to Sheets using last cached data (no fetch/merge/cards)
  ts-node src/run_optimizer.ts --sheets-only

  # Use only cached odds (no API calls)
  ts-node src/run_optimizer.ts --no-fetch-odds

  # Force fresh odds from APIs (respects limits)
  ts-node src/run_optimizer.ts --force-refresh-odds

  # Force SGO call even if daily limit reached
  ts-node src/run_optimizer.ts --force-sgo

  # Force TheRundown call even if daily limit reached
  ts-node src/run_optimizer.ts --force-rundown

  # Force both providers (bypass all daily limits)
  ts-node src/run_optimizer.ts --force-sgo --force-rundown

  # Run optimizer using only TheRundown, then push to Sheets
  ts-node src/run_optimizer.ts --rundown-only --force-rundown

  # Same as above: explicit TRD odds source (test UD merge / alt lines)
  ts-node src/run_optimizer.ts --odds-source trd --force-rundown

  # Use 30-minute cache interval
  ts-node src/run_optimizer.ts --refresh-interval-minutes 30

CACHE LOCATION:
  .cache/odds-cache.json (in project root)

RATE LIMIT RESPECT:
  - Odds API: Primary odds source; cache reduces API calls and stays within limits
`);
}

// Export parsed args for use in modules
export const cliArgs = parseArgs();

// Show help if requested
if (cliArgs.help) {
  showHelp();
  process.exit(0);
}

// Print effective config and exit without running
if (cliArgs.printEffectiveConfig) {
  printEffectiveConfig();
  process.exit(0);
}
