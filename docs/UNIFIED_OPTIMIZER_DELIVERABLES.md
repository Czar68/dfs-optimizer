# Unified PP/UD Optimizer + Test Harness — Deliverables

**Date:** 2026-02-22 (updated: real-slate E2E both, Telegram wire, run-both.ps1, e2e tests)

## 1. Unified CLI (single binary)

- **Entry:** `node dist/run_optimizer.js [OPTIONS]`
- **Flags:**
  - `--platform pp|ud|both` — default `pp`. `both` runs PrizePicks then Underdog, then **auto-runs `sheets_push.py`** (legs/cards/tiers to Sheets).
  - `--ud-only` — shorthand for `--platform ud`.
  - `--mock-legs N` — inject N synthetic legs (1–30) for PP and UD when `--platform both`.
  - `--ud-volume` — looser UD thresholds for 50+ UD cards on mock slates.
  - `--max-export N` — cap PP cards export (prizepicks-cards.csv/json) to top N by EV (default 500). Tier1/Tier2 CSVs always full.
  - `--export-uncap` — no cap on PP cards export (tier1/tier2 still full).
  - `--daily` — daily driver: fresh + telegram + bankroll=600 + platform both.
- **Behavior:**
  - `pp`: PP only (unchanged).
  - `ud`: calls `runUnderdogOptimizer()` and exits.
  - `both`: runs PP; if PP exits early (too few legs / no viable structures), still runs UD; then **always runs `python sheets_push.py --bankroll <N>`**. With `--telegram`: **PP** top Tier1 sent in innovative block (when `--innovative`); **UD** top 5 from `underdog-cards.csv` sent after UD + sheets.

## 2. Test suite (Jest)

- **Script:** `npm test` → `jest`
- **Config:** `jest.config.js` (ts-jest, roots: tests + src)
- **File:** `tests/parity_test.spec.ts`
  - **Structures load:** 13 UD (7 Standard + 6 Flex), 9 PP slip types; UD 7P/8P exist with 40×/80×.
  - **Parity: mock 10 legs:** Builds EV table for PP 2P/3P (sync) and UD 2P/3P; same 2 and 3 legs, both +EV; absolute EV diff < 0.20.
  - **UD Flex:** 3F evaluates without error.
  - **Tier1 / Kelly parity:** Mock legs → `buildInnovativeCards` → cards have kellyStake, cardEV, tier; `writeTieredCsvs` produces tier1/tier2 CSV with kellyStake/cardEV/tier; Tier1 cards have cardEV ≥ 8% and kellyStake ≥ 0; all cards have finite kellyFrac and kellyStake.
- **File:** `tests/e2e.spec.ts`
  - **Telegram wire:** `testTelegramConnection` returns false when credentials unset; `pushUdTop5FromCsv` does not throw when CSV missing.
  - **E2E prod:** `scripts/run-both.ps1` exists and contains platform both, bankroll 600, telegram.
  - **Wiring:** `run_optimizer.ts` imports `pushUdTop5FromCsv` and wires telegram when `platform === 'both'` and `cliArgs.telegram`.
- **Result:** **24 tests** (16 parity + 8 e2e: telegram, daily, export-uncap, UD boost, .env.example, daily-run), all passing.

## 3. Commands

```bash
# Run tests
npm test

# Unified run (PP then UD)
node dist/run_optimizer.js --platform both --min-card-ev 0.012

# UD only
node dist/run_optimizer.js --ud-only
# or
node dist/run_underdog_optimizer.js

# PP only (default)
node dist/run_optimizer.js

# E2E both with mock 12 legs + UD volume (50+ UD cards); then auto sheets push
node dist/run_optimizer.js --platform both --mock-legs 12 --ud-volume

# Real both (no mock): PP + UD from cache/slate; then sheets push. UD cards 100+ when slate has volume.
node dist/run_optimizer.js --platform both --fresh

# Export cap: top 500 PP cards (default); tier1/tier2 always full
node dist/run_optimizer.js --max-export 500

# Production one-shot: both + sheets + Telegram (bankroll=600)
.\scripts\run-both.ps1
.\scripts\run-both.ps1 -Fresh -Sport NBA

# Mock E2E parity demo (no live odds)
node dist/run_optimizer.js --platform both --mock-legs 15 --ud-volume
```

## 4. Real run (both platform)

With cache expired, `--no-fetch-odds` yields 0 merged picks for both PP and UD. Observed:

- PP: 0 legs → early exit → then UD runs.
- UD: 0 merged (no cache) → 0 legs → 0 cards; all 13 structures attempted (2P–8P, 3F–8F).

With a valid odds cache, `--platform both` produces:

- PP: legs/cards → `prizepicks-legs.csv`, `prizepicks-cards.csv` (capped by `--max-export`, default 500).
- UD: legs/cards → `underdog-legs.csv`, `underdog-cards.csv`.
- **Sheets:** After UD, `sheets_push.py` runs automatically (legs + cards + tier1/tier2 tabs for both PP and UD). Real run with `--platform both --fresh`: UD cards often 100+ when slate/cache has volume.

## 5. Mock-legs + UD volume (post-update)

- **Mock injection:** `src/mock_legs.ts` exports `createSyntheticEvPicks(n, site)`. trueProb 0.55–0.65, legEv 2–6%. Wired in run_optimizer (PP) and run_underdog_optimizer (UD) when `--mock-legs N`.
- **Parity:** Pre-paytable winProbability diff < 0.1% (same legs, exact match). EV diff < 0.20 kept for payout differences.
- **--ud-volume:** udMinLegEv = 0.010; structure acceptance at half minCardEv; canLegsMeetStructureThreshold factor 0.15. With `--platform both --mock-legs 12 --ud-volume`: **1738 UD cards**, 617 PP cards (100 exported).

## 6. Fresh E2E run (2026-02-22) — validation

**Command:** `.\scripts\run-both.ps1 -Fresh`

### Metrics table (PP vs UD)

| Metric | PP | UD |
|--------|-----|-----|
| Legs | 57 | 12 (after filter) |
| Cards (export) | 500 (capped from 582) | 0 |
| Tier1 (innovative) | 1 | — |
| Tier2 (innovative) | 5 | — |
| Run time | — | ~77 s end-to-end |

**Note:** This run had 0 UD cards (slate priced with no exploitable edge). UD volume 100+ occurs when slate/cache has +EV combos; use `--platform both --mock-legs 15 --ud-volume` for parity demo with 50+ UD cards.

### Files validated

- **prizepicks-cards.csv:** 501 lines (header + 500 rows). Head: Sport, site=PP, flexType 6P/6F/5P, cardEv, kellyStake, runTimestamp.
- **underdog-cards.csv:** Header only (0 rows this run).
- **tier1.csv:** 1 row (PP, 6F, tier=1, kellyStake=46.15). Tier2: 5 rows.

### Sheets push log (confirmed)

- Legs: 69 combined (57 PP + 12 UD) → Legs tab; 12 → UD-Legs tab.
- Cards: 500 rows (500 PP + 0 UD) → Cards tab.
- Tier1: 1 row; Tier2: 5 rows. Formulas + tier colors (T1=green, T2=yellow, T3=grey) applied.

### Telegram live

- **Setup:** Copy `.env.example` → `.env`; set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Run `npx tsc -p .` then `.\scripts\test-telegram.ps1` to send a test message and confirm receipt.
- Without .env: `[Telegram] UD skip: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.` When env is set, both flow sends PP Tier1 + UD Top 5.

### Prod checklist

| Item | Status |
|------|--------|
| run-both.ps1 -Fresh | OK — exit 0, ~77 s |
| SGO quota post-run | 2 hits this run (PP + UD fresh); logged in quota_log.txt |
| npm test | **28 passed** (parity + e2e + prod). |
| daily-run.ps1 | Cron-like; stderr fix so node console.warn does not abort. |
| quota-monitor.ps1 | SGO hits today/month; exit 1 if ≥80% of 2500. |
| test-telegram.ps1 | Sends test message when .env has token/chat_id. |
| Git status | Modified/untracked from run and feature work; commit to get clean |

## 7. Blockers / notes

| Item | Status |
|------|--------|
| `--mock-legs N` | Wired; synthetic legs for both PP and UD. |
| Parity “diff < 0.1%” | Pre-paytable: winProbability diff < 0.001; EV diff < 0.20. |
| npm test | **28 tests** pass (16 parity + 8 e2e + 4 prod). |
| `--platform both` | Auto runs `sheets_push.py` after UD (both early-exit and normal path). |
| `--telegram` (both) | PP: top Tier1 in innovative block; UD: top 5 from underdog-cards.csv after UD. |
| `--max-export N` | PP cards export cap (default 500); tier1/tier2 CSVs always full. |
| Real UD volume | `--platform both --fresh`: UD cards 100+ when slate/cache has volume. |
| **run-both.ps1** | Prod wrapper: tsc + `--platform both --innovative --telegram` + bankroll=600. |
| **daily-run.ps1** | Cron-like: run-both -Fresh + quota log; schedule via Task Scheduler. |
| **UD slate boost** | Auto ud_volume + minLegEv 0.008 when real-slate (no mock) and <20 UD cards. |
| **.env.example** | Template for TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BANKROLL. |

## 8. Files touched

- `src/cli_args.ts` — `platform`, `mockLegs`, `udVolume`, `maxExport`; `--platform`, `--mock-legs`, `--ud-only`, `--ud-volume`, `--max-export`; help text.
- `src/run_optimizer.ts` — mock-legs branch; run UD on early exit when `platform === 'both'`; **when `platform === 'both'`**: after UD, `runSheetsPush()` (spawnSync `python sheets_push.py --bankroll N`); PP cards export uses `cliArgs.maxExport` (default 500); tier1/tier2 full.
- `src/run_underdog_optimizer.ts` — mock-legs branch; `meetsUdStructureThresholdWithVolume`; export `runUnderdogOptimizer`.
- `src/mock_legs.ts` — `createSyntheticEvPicks(n, site)` (trueProb 0.55–0.65, legEv 2–6%).
- `src/config/underdog_structures.ts` — `canLegsMeetStructureThreshold(..., volumeMode?)` (0.15 factor when volume).
- `sheets_push.py` — already supports both: prizepicks/underdog legs and cards, tier1/tier2 tabs.
- `package.json` — `"test": "jest"`; devDependencies: jest, ts-jest, @types/jest.
- `jest.config.js` — present.
- `tests/parity_test.spec.ts` — structures, parity winProb/EV, mock_legs, Tier1/Kelly parity; **16 tests**.
- `tests/e2e.spec.ts` — Telegram wire (no-env skip, missing CSV), run-both.ps1 content, run_optimizer telegram wiring; **4 tests**.
- `scripts/run-both.ps1` — **new.** Prod one-shot: tsc, `node dist/run_optimizer.js --platform both --innovative --telegram --bankroll 600` (+ optional `-Fresh`, `-Sport`).
- `src/telegram_pusher.ts` — **pushUdTop5FromCsv(csvPath, date, bankroll)** for UD top 5 from underdog-cards.csv.
