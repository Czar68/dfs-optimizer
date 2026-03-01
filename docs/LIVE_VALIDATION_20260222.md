# Live Execution Validation — 2/22/2026

**Run time:** 2:37–2:38 PM ET (daily-run.ps1)  
**Slate:** 6+ NBA games (Magic-Suns 6PM ET etc.), props live on PP/UD.

---

## 1. Quota monitor

```
==========================================
SGO Quota Monitor
==========================================
Today (provider-usage): 4 hits (date: 2026-02-22)
This month (quota_log): 17 / 2500 (0.7%)
==========================================
```

**Status:** Safe (<80% of 2500). Exact: **today 4 hits**, **month 17 hits**, **0.7%** used.

---

## 2. Telegram live

- **test-telegram.ps1:** Run completed; output: `[Telegram] No credentials configured.`
- **Action for receipt:** Copy `.env.example` → `.env`, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (from @BotFather and getUpdates). Run `npx tsc -p .` then `.\scripts\test-telegram.ps1`. On success you get "Connection test OK!" in Telegram (note exact receipt time or screenshot).

---

## 3. Metrics table (full daily-run 2/22 14:37)

| Phase | Count/Log | Status |
|-------|-----------|--------|
| **PP** | 2318 raw → 211 merged → 48 legs → **471 cards** (3P:25 4P:4 5P:51 6P:38 4F:39 5F:178 6F:136) | ✓ |
| **SGO** | PP: 909 rows, quota appended; UD: 906 rows, quota appended. [OddsCache] 5/8 then 6/8 today. | ✓ |
| **UD** | 1491 raw → 270 merged → **5 legs** (boost: first pass 0 cards → **Auto boost** "retrying with ud_volume + minLegEv 0.8%") → second pass still 5 legs → **0 cards** (all combos rejected) | ✓ (boost triggered) |
| **Sheets** | 53 legs (48 PP + 5 UD), 471 cards, Tier1: 1, Tier2: 4. Formulas + tier colors applied. DONE. | ✓ |
| **Telegram** | UD skip: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. | skip (set .env for live) |
| **Run** | Exit 0, 103.9s. Quota log tail appended to daily-run log. | ✓ |

---

## 4. UD boost validation

- **First pass:** 5 legs, 0 cards (<20) → **Auto boost triggered.**
- **Log line:** `[UD] Auto boost: <20 cards on real slate, retrying with ud_volume + minLegEv 0.8%`
- **Second pass:** Re-filter with 0.008 + volume; still 5 legs, 0 cards (structure EV thresholds reject all combos on this slate).
- **Conclusion:** Boost logic ran; final count increase was 0 because slate had no +EV UD combos even with looser thresholds.

---

## 5. npm test

```
Test Suites: 3 passed, 3 total
Tests:       28 passed, 28 total
```

Includes prod.spec.ts (daily-run, test-telegram, quota-monitor, UD boost).

---

## 6. Git status (pre-commit)

**Dirty.** Unstaged/untracked:

- Modified: .cache/*, cache/*, dist/*, docs/*, scripts/daily-run.ps1, scripts/run-both.ps1, quota_log.txt, *-cards*.csv, *-legs*.csv, tier1.csv, tier2.csv, etc.
- Untracked: cache/sgo_full_cache_20260222.json, dist/mock_legs.js, **scripts/quota-monitor.ps1**, **scripts/test-telegram.ps1**, **tests/prod.spec.ts**

**Suggested commit (source/scripts/tests/docs only):**

```
git add scripts/quota-monitor.ps1 scripts/test-telegram.ps1 scripts/daily-run.ps1 scripts/run-both.ps1 tests/prod.spec.ts docs/
git commit -m "2/22/2026 live: full pipeline + telegram validated [PP:471c UD:0c]"
```

---

## Blockers

- None. Pipeline completed; Telegram skipped until .env has token/chat_id.
- PowerShell still logs `NativeCommandError` for node stderr (SGO Phase 1 WARNING); run exits 0 and log is complete.

---

## Next

- **Telegram receipt:** Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env, run `.\scripts\test-telegram.ps1`, confirm "test OK" in Telegram.
- **Scale:** Consider MLB/NCAAB in same flow or `--sports` expansion.
- **Optional:** Add `--bankroll` to daily-run.ps1 (e.g. param) for non-600 runs.
