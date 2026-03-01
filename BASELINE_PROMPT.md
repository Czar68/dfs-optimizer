# BASELINE PROMPT – Multi-Sport Architecture

## Current State (Updated Baseline)

✅ Underdog is now fully multi-sport:

- `src/fetch_underdog_props.ts`: `fetchUnderdogRawProps(sports: Sport[])` accepts `Sport[]`, intersects with `getAllowedUDLeagues()`, tags `RawPick.sport`.
- `src/run_underdog_optimizer.ts`: `--sports NBA,NHL` correctly parses, logs effective sports, defaults to `['NBA']`.
- CSV writers: Sport is first column, sourced from `leg.sport` (legs) and `card.legs[0].sport` (cards).
- Tested: `node dist/run_underdog_optimizer.js --sports NBA,NHL` → works, filters by env.

Other multi-sport infra:

- PrizePicks + SGO/TheRundown odds already respect `--sports`.
- `merge_odds.ts` matches on `(sport, player, stat, line)`.
- Consensus devig uses weighted median (FanDuel 1.0, Pinnacle/Circa 0.7, others 0.3).
- Python push scripts updated for Sport column A.

## What you should assume is still pending

- Some Google Sheets formulas may still assume old column positions and may need manual updating (outside this repo) to account for the new Sport column at A.
- Environment may need updating to enable additional sports (e.g., NHL in `getAllowedUDLeagues()` for Underdog).

## Invariants (DO NOT CHANGE)

- SGO → TheRundown fallback chain
- Caching, TTL, daily caps (`SGO_MAX_CALLS_PER_DAY`, TheRundown datapoints), force flags
- Sport as FIRST column in ALL CSVs and Sheets (Legs!A2:P, UD-Legs!A2:Q, Cards!A2:AF)
- `npx tsc -p .` must pass
- Existing CLI behavior: `--sports` absent → NBA-only default
- Consensus devig (FanDuel 1.0, Pinnacle/Circa 0.7, median+MAD outlier removal)
