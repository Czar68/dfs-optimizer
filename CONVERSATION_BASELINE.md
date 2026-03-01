1. CONVERSATION_BASELINE.md
Save this at the repo root as CONVERSATION_BASELINE.md.

text
# CONVERSATION BASELINE – 2026-02-04 (END OF DAY)

**Current Commit:** `d249dab`  
**Status:** ✅ Compiling cleanly, SGO working, 35 cards generated

## Last Known Good State

```bash
npx tsc -p .
→ 0 errors

node dist/run_optimizer.js
→ 2,140 PrizePicks props
→ 812 SGO markets merged
→ 160 matched picks
→ 22 legs (edge ≥ 0.02)
→ 35 flex cards written
Changes To Reapply Next Session
PrizePicks optimizer: lower edge floor, add await around merge.

Underdog optimizer: lower edge floor, add await around merge.

Security: remove old Google token, ignore token file, re-auth Sheets.

Change 1: PrizePicks Optimizer Edge Floor
File: src/run_optimizer.ts

Line 21: const MIN_EDGE_PER_LEG = 0.015; (was 0.02)

Line ~351: Add await to mergeOddsWithProps(raw)

Change 2: Underdog Optimizer Edge Floor & Await
File: src/run_underdog_optimizer.ts

Line 17: const MIN_EDGE_PER_LEG = 0.015; (was 0.02)

Line ~261: Add await to mergeOddsWithProps(raw)

Change 3: Security
Files affected:

Delete token.json (revoked)

Add token.json to .gitignore

Re-authenticate Google Sheets API

Known Issues
Legs CSV has extra row

Symptom: extra row reappeared after being fixed once.

Likely location: writeLegsCsv() or equivalent legs-writing function.

Sheets column misalignment

Symptom: card data shifted one column to the right in Google Sheets.

Likely location: sheets_push_legs.py column range / append logic.

Underdog snapshot missing

Symptom: data/processed/ud_nba_snapshot.json missing; Underdog optimizer produces 0 cards.

Action: restore or rebuild Underdog snapshot pipeline.

Fantasy analyzer

Symptom: disabled from console output but still runs.

Action: can be fully disabled with // TODO: scaffold if needed.

Weekly quota exceeded

Symptom: Google Sheets API quota hit; pushes failing.

Action: wait for reset; minimize unnecessary pushes.

Key Files & Status
File	Status	Notes
src/run_optimizer.ts	✅ Working	PrizePicks; needs edge floor + await changes.
src/run_underdog_optimizer.ts	⚠️ Broken snapshot	Needs edge floor + await changes + snapshot fix.
src/merge_odds.ts	✅ Locked	SGO-only; no fallback; all stats supported.
src/calculate_ev.ts	✅ Locked	Uses trueProb from merge; simple edge.
src/fetch_sgo_odds.ts	✅ Working	Live SGO NBA+NFL.
src/payouts.ts	✅ Stable	PrizePicks + Underdog payout math.
src/card_ev.ts	✅ Stable	Card EV + hit distribution.
Data Flow (Immutable)
text
PrizePicks API
    ↓
fetchPrizePicksRawProps() → RawPick[]
    ↓
mergeOddsWithProps(raw) [SGO required] → MergedPick[]
    ↓
calculateEvForMergedPicks() → EvPick[]
    ↓
Filter (edge ≥ MIN_EDGE_PER_LEG) + 24h gameTime + player cap
    ↓
buildCardsForSize() → CardEvResult[]
    ↓
Output: {json,csv} files
Constants (Tuning Knobs)
MIN_EDGE_PER_LEG → should be 0.015 (after reapplying change)

MIN_CARD_EV_FRACTION_LARGE → 0.42

MIN_CARD_EV_FRACTION_SMALL → 0.6

MAX_LEGS_PER_PLAYER → 1

MAX_CARDS_PER_RUN → 6

Next Actions (Execution Order)
Apply 2 changes (edge floor + await) in PrizePicks + Underdog.

Verify compile & run.

Commit each change separately.

Investigate legs CSV extra row.

Fix sheets_push_legs.py column offset.

Tackle Underdog snapshot issue.