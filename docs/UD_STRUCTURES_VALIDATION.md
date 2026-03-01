# UD Structures Expansion Validation (Light Mode)

**Date:** 2026-02-22  
**Scope:** Diagnostics + config only. Validate 7P/8P structures + parity fix.

---

## 1. npm test — compile/structures

- **Result:** `npm test` exits 1 — **no test script** (package.json: `"test": "echo \"Error: no test specified\" && exit 1"`).
- **Compile:** `npx tsc` completes successfully (exit 0). Structures load via `UNDERDOG_STANDARD_STRUCTURES` / `UNDERDOG_FLEX_STRUCTURES`; no runtime errors.

**Recommendation:** Add a minimal test script that runs `npx tsc --noEmit` and optionally imports `./dist/config/underdog_structures.js` to assert 13 structures.

---

## 2. Config verification — 7P/8P + thresholds

**File:** `src/config/underdog_structures.ts`

| Structure   | Payout | minCardEv | Note        |
|------------|--------|-----------|-------------|
| UD_7P_STD  | 40×    | **0.028 (2.8%)** | 7-pick Standard |
| UD_8P_STD  | 80×    | **0.032 (3.2%)** | 8-pick Standard |

- **7P:** `breakEvenLegWinRate: 0.5421` — (1/40)^(1/7) ≈ 54.21%.
- **8P:** `breakEvenLegWinRate: 0.5250` — (1/80)^(1/8) ≈ 52.50%.

**Total structures:** 7 Standard (2P–8P) + 6 Flex (3F–8F) = **13**.

---

## 3. Sim 8-leg UD slate (--mock-legs 8)

- **Status:** **Not implemented.** `--mock-legs` does not exist in `run_optimizer.js` or `run_underdog_optimizer.js`.
- **run_optimizer.js** is PrizePicks-only; UD is run via **run_underdog_optimizer.js** (no `--ud-only` in run_optimizer).
- With **2 viable legs** on current slate, only 2P gets attempts; 3P–8P and 3F–8F correctly show "0 attempts allocated (insufficient viable legs)". When leg count ≥ 8, 7P/8P and 7F/8F would receive attempts (confirmed by structure loop).

**Blocker:** To "sim 8-leg UD slate" would require either:
  - A `--mock-legs N` that injects N synthetic legs into the UD pipeline, or
  - Running on a slate/day where UD merge produces ≥ 8 legs.

---

## 4. Real UD run — target 50+ cards

**Command run:**
```bash
node dist/run_underdog_optimizer.js --no-fetch-odds --ud-min-ev 0.012
```

**Result:**

| Metric        | Value |
|---------------|--------|
| Merged picks  | 48     |
| Legs (after filter) | 2 (2 std, 0 boost, 0 disc) |
| adj-EV range  | -1.9% – -1.3% |
| **Cards**     | **0**  |
| Structures with attempts | 1 (UD_2P_STD only) |

**Conclusion:** On this slate, UD has no exploitable edge (discounted picks dominate; best 2P combo EV = -5.8%, need 0.5%). **50+ cards** is not achievable without either more legs passing the factor-aware filter or relaxing thresholds (not recommended).

---

## 5. ud-legs.csv head 5 (EV/juice)

**Actual file:** `underdog-legs.csv` (no `ud-legs.csv` in repo). Columns include: Sport, id, player, team, stat, line, league, book, **overOdds**, **underOdds**, **trueProb**, **edge**, **legEv**, runTimestamp, gameTime, IsWithin24h, IsNonStandardOdds.

**Head 5 (2 legs on current run):**

| player             | stat     | line | overOdds | underOdds | trueProb | edge   | legEv  |
|--------------------|----------|------|----------|-----------|----------|--------|--------|
| Isaiah Hartenstein | rebounds | 8.5  | -125     | -104      | 0.521    | 2.1%   | 2.1%   |
| Paolo Banchero     | points   | 21.5 | -124     | -108      | 0.516    | 1.6%   | 1.6%   |

Juice implied by odds; no separate "juice" column. Card count per type: **0** (no cards accepted).

---

## 6. CLI: --ud-min-ev default

**Added:**

- **cli_args.ts:** `udMinEv: number | null`, parsed as `--ud-min-ev <num>`. Default when not provided: **0.012** (used in run_underdog_optimizer only).
- **run_underdog_optimizer.ts:** `udMinLegEv = cliArgs.udMinEv ?? cliArgs.minEv ?? 0.012` (was `cliArgs.minEv ?? UNDERDOG_GLOBAL_LEG_EV_FLOOR`).

**Files touched:** `src/cli_args.ts`, `src/run_underdog_optimizer.ts`. No change to `underdog_card_ev.ts` (thresholds live in `underdog_structures.ts`).

---

## 7. Metrics table — PP vs UD (structures / cards)

| Platform   | Structures              | Legs (this run) | Cards (this run) | Notes                          |
|-----------|--------------------------|-----------------|-------------------|---------------------------------|
| PrizePicks| 9 (2P–6P, 3F–6F)        | 12–16 typical   | 100 (capped)      | Many +EV legs this slate        |
| Underdog  | **13** (2P–8P, 3F–8F)   | 2               | 0                 | 7P/8P present; 0 legs for 3+   |

Parity target (50+ UD cards) is **blocked by slate/market**: only 2 UD legs pass the factor-aware filter; best card EV -5.8% vs need 0.5%.

---

## 8. Two CLI commands (for validation)

1. **Compile + UD run (cache-only, 1.2% leg EV):**
   ```bash
   npx tsc && node dist/run_underdog_optimizer.js --no-fetch-odds --ud-min-ev 0.012
   ```

2. **UD run with default ud-min-ev (0.012):**
   ```bash
   node dist/run_underdog_optimizer.js --ud-min-ev 0.012
   ```
   (Omitting `--ud-min-ev` now defaults UD leg EV floor to 1.2%.)

---

## 9. Blockers

| Blocker | Description |
|---------|-------------|
| No test script | `npm test` fails; add at least `tsc --noEmit` + optional structure load check. |
| No --mock-legs | Sim 8-leg UD slate not possible without new flag or synthetic legs. |
| No --ud-only in run_optimizer | UD is run via `run_underdog_optimizer.js` only; `run_optimizer.js` is PP-only. |
| Slate/market | 0 UD cards on current slate; 50+ cards requires more legs with positive adjusted EV. |

---

**Deliverables summary:** Config verified (7P 2.8%, 8P 3.2%); 13 structures; `--ud-min-ev` added with default 0.012; metrics table and two CLI commands documented; blockers listed above.
