# Dashboard & Pipeline Fix Plan (2026-03-15)

Attack order: fix one issue at a time, verify (tsc, jest, build/deploy where applicable), then move to the next. Pipeline changes require a run + full deploy to see results on the live site.

---

## Issue 1 — Goblin EV / Kelly overstated (PIPELINE)

**Symptom:** All-goblin 6P cards show ~2.14 EV and ~$147 Kelly; true goblin payout (~22.5x) yields ~0.93 EV and ~$65 Kelly.

**Root cause:** Card EV and Kelly use the standard payout table (e.g. 6P = 37.5x). `scoringWeight` 0.95 only haircuts leg EV and composite score by 5%; it does not change the payout table used for card EV.

**Goal:** When a card has any goblin leg, use a goblin-specific payout table (e.g. 6P goblin = 22.5x). Confirm exact multipliers on PrizePicks before coding.

**Files (likely):**
- `src/config/parlay_structures.ts` or new `src/config/prizepicks_goblin_payouts.ts` — add goblin payoutByHits.
- `src/card_ev.ts` and/or `src/build_innovative_cards.ts` (or wherever card EV is computed from hit distribution) — detect goblin card and use goblin table.
- `src/config/prizepicks_payouts.ts` — if used for card EV, add goblin branch.

**Tasks:**
1. Confirm current PrizePicks goblin 2P–6P (and flex) payout multipliers (app or docs).
2. Add goblin payout definitions (canonical source; no duplicated constants).
3. In card EV path: if any leg has `scoringWeight < 1`, use goblin payout table for that card.
4. Run optimizer; check tier1/tier2 and cards CSV for all-goblin cards (lower cardEV, lower kellyStake).
5. Run `npx tsc --noEmit`, `npx jest --no-coverage`. No schema change to CSV column order without updating CRITICAL_DEPENDENCIES.

**Verification:** All-goblin 6P in tier1 has cardEV ~0.9–1.0 and kellyStake roughly half of current. Dashboard shows updated numbers after `npm run web:deploy`.

**PROJECT_STATE.md:** FILES_MODIFIED for parlay_structures / new goblin config and card_ev or build_innovative_cards; WEBPAGE or PIPELINE section note: goblin cards use goblin payout table for EV and Kelly.

---

## Issue 2 — First three Best Bets identical / expand opens all three (DASHBOARD + optional PIPELINE)

**Symptom:** First three rows on Best Bets look the same; clicking one expands all three.

**Root cause:**
- **Expand:** `isExpanded` uses `selectedCard.leg1Id === row.leg1Id && selectedCard.site === row.site`. Duplicate cards share the same `leg1Id` (and site), so all match the same `selectedCard`.
- **Duplicates:** tier1.csv can contain near-duplicate rows (same legs except one leg ID difference, e.g. two “14.5 PTS” legs); pipeline may emit multiple cards that differ only by one leg.

**Goal:** One expanded row per click. Optionally reduce duplicate cards in tier output.

**Files:**
- `web-dashboard/src/components/CardsPanel.tsx`

**Tasks (dashboard):**
1. Use a **unique row key** for expand state instead of (leg1Id, site). Options:
   - Compare by **all leg IDs** for the row: e.g. `getCardLegIds(row).join('|')` so two rows with different leg sets don’t both expand.
   - Or store expanded key as a string like `rowKey = `${row.site}-${getCardLegIds(row).join('-')}` and set `selectedCard` to that key (or an object that includes it) and compare by `rowKey`.
2. Ensure only the clicked row expands (and toggling the same row collapses).
3. Keep row React key stable (e.g. `best-${row.site}-${i}` or include leg IDs so list order changes don’t break keys).

**Tasks (pipeline, optional):**
4. In tier generation / card builder, deduplicate cards that are effectively the same (e.g. same set of legs, or same legs except one alternate leg). Document in PROJECT_STATE if done.

**Verification:** Best Bets: click row 1 → only row 1 expands; click row 2 → only row 2 expands; click row 1 again → row 1 collapses. tsc + jest pass; `npm run web:build` succeeds.

**PROJECT_STATE.md:** FILES_MODIFIED CardsPanel.tsx: expand state by unique row key (all leg IDs or equivalent).

---

## Issue 3 — LEGS SUMMARY shows first names instead of last names (DASHBOARD)

**Symptom:** “Naz + Jaylon + Ajay +3 more” instead of “Reid + Tyson + Mitchell +3 more”.

**Root cause:** In `formatLegsSummary`, when `items.length === 0` the fallback uses `lastName(p.split(/\s+/)[0] ?? p)` — i.e. the **first word** of each segment, so we get first names.

**File:** `web-dashboard/src/components/CardsPanel.tsx`

**Tasks:**
1. In `formatLegsSummary`, fix the fallback (when `items.length === 0`):
   - For each part `p`, derive the **name** part (strip trailing stat + line tokens, same logic as STRONG player column: drop tokens that match stat abbrev or `o/u` + number).
   - Use `lastName(name)` for that segment, not `lastName(firstWord)`.
2. Keep existing logic when `items.length > 0` (stat-grouped last names).

**Verification:** Best Bets LEGS SUMMARY shows “Reid + Tyson + Mitchell +3 more” (or similar last names). tsc + jest pass.

**PROJECT_STATE.md:** FILES_MODIFIED CardsPanel.tsx: formatLegsSummary fallback uses last name from full name segment.

---

## Issue 4 — Duplicate game/time bubbles for same game (DASHBOARD)

**Symptom:** Same matchup appears as “1:00 PM MIN @ OKC” and “1:10 PM MIN @ OKC” (and similar for other games).

**Root cause:** `gameOptions` dedup key includes **time**: when `gameId` is missing, `key = `${gameKeySuffix}|${timeStr || gt || ''}``. Different times for the same matchup produce different keys, so multiple bubbles per game.

**Goal:** One bubble per game (matchup). Show a single time per game (e.g. earliest) or a combined label.

**File:** `web-dashboard/src/components/CardsPanel.tsx`

**Tasks:**
1. In `gameOptions` useMemo, when we have a matchup (sortedTeams.length === 2), use **only** `gameKeySuffix` (e.g. `"MIN @ OKC"`) as the dedup key — not `gameKeySuffix|time`.
2. When merging legs into the same key, keep one time for display (e.g. keep earliest `gameTime` or first non-empty `timeStr`).
3. Ensure `label` for the bubble still shows time + matchup (e.g. “1:00 PM MIN @ OKC” using the single chosen time).

**Verification:** GAMES row shows one bubble per matchup (e.g. one “MIN @ OKC”, one “DET @ TOR”). Filtering by game still works. tsc + jest pass; `npm run web:deploy` and spot-check live.

**PROJECT_STATE.md:** FILES_MODIFIED CardsPanel.tsx: game bubble dedup by matchup only; one time per game.

---

## Issue 5 — Top Legs PP / UD not appearing (DASHBOARD)

**Symptom:** TOP LEGS PP and TOP LEGS UD tabs show 0 legs even though legs load (e.g. PP=79, UD=31).

**Root cause:** Either (a) all legs filtered out by game filter or gameTime filter, or (b) wrong data source / path for the tab, or (c) initial selection of games (e.g. “all selected”) still results in no match due to key mismatch.

**File:** `web-dashboard/src/components/CardsPanel.tsx`

**Tasks:**
1. Add or inspect diagnostic logging: when view is `legs-pp` or `legs-ud`, log `filteredLegsByView.length`, `filteredLegs.length`, and whether `selectedGames` / `legMatchesGame` or `isGameTimeFuture` are removing everyone.
2. If game filter is too strict: ensure “all games selected” means no game filter applied (filter passes all legs). Check `legMatchesGame` and how `selectedGames` is populated.
3. If gameTime is filtering all: ensure TOP LEGS uses the same `isGameTimeFuture` logic as cards (time-only or invalid → future). Confirm `filteredLegs` useMemo uses it.
4. If path/load issue: confirm `DATA_BASE` and CSV paths for PP/UD legs; ensure deploy copies legs CSVs and they return 200 on live site.

**Verification:** TOP LEGS PP shows up to 50 legs; TOP LEGS UD shows up to 50 legs when data exists. tsc + jest pass; deploy and check live.

**PROJECT_STATE.md:** FILES_MODIFIED CardsPanel.tsx: fix TOP LEGS filtering or selection so legs appear when data exists.

---

## Issue 6 — Kelly multiplier “way off” (PIPELINE — follows Issue 1)

**Symptom:** Kelly stake feels too high for all-goblin cards.

**Root cause:** Same as Issue 1 — Kelly is derived from card EV; with goblin payouts fixed, Kelly will be recalculated in the pipeline.

**Goal:** No separate code change; verify after Issue 1 that Kelly values for goblin cards are in a reasonable range (e.g. ~$65 for the previously $147 card).

**Tasks:** None beyond Issue 1. After deploying pipeline + dashboard, confirm on dashboard that Kelly for all-goblin Best Bets is reduced.

**PROJECT_STATE.md:** Covered by Issue 1.

---

## Issue 7 — Link opens page but doesn’t load picks (PLATFORM LIMITATION)

**Symptom:** “Link” opens PrizePicks (or Underdog) but doesn’t prefill the slip.

**Root cause:** PrizePicks/Underdog apps or web do not support deeplinks that pre-populate a specific parlay. The “Link” uses `DeepLink` from the CSV (e.g. `https://app.prizepicks.com`), which is app/home only.

**Goal:** Document limitation; optionally try to find a share URL format that preloads picks (may not exist).

**Tasks:**
1. In docs (e.g. PROJECT_STATE.md WEBPAGE or this plan), add: “Link button opens PrizePicks/Underdog app or site; platform does not support pre-filled picks via URL.”
2. Optional: quick web search for PrizePicks/Underdog share or deeplink API; if none, leave as-is.

**Verification:** No code change required for “works as designed.” Optional: one-line doc update.

**PROJECT_STATE.md:** WEBPAGE — note Link opens app/site; prefill not supported by platform.

---

## Issue 8 — Bold first row (DASHBOARD — Fix 10 from PROJECT_STATE)

**Symptom:** First row of a table appears bold when it shouldn’t.

**Root cause:** Global CSS (e.g. `tr:first-child` or `td:first-child` with `font-weight: bold`).

**Files:** `web-dashboard/src/index.css`, `App.css`, or other global styles; possibly table-specific CSS.

**Tasks:**
1. Search for `first-child` or `font-weight: bold` on `tr`/`td` in dashboard CSS.
2. Remove or narrow the rule so the first data row is not bold (or keep bold only for header row).

**Verification:** First card row is not bold. tsc + jest pass.

**PROJECT_STATE.md:** FILES_MODIFIED for the CSS file; TODO Fix 10 marked done.

---

## Order of attack (summary)

| Order | Issue | Type |
|-------|--------|------|
| 1 | Goblin EV/Kelly (payout table) | Pipeline |
| 2 | Expand opens all three / unique row key | Dashboard |
| 3 | LEGS SUMMARY last names | Dashboard |
| 4 | Duplicate game bubbles | Dashboard |
| 5 | Top Legs PP/UD not appearing | Dashboard |
| 6 | Kelly (verify after #1) | — |
| 7 | Link prefill (document) | Docs |
| 8 | Bold first row (Fix 10) | Dashboard |

After each fix: run `npx tsc --noEmit` and `npx jest --no-coverage`; for dashboard-only changes run `npm run web:build` (and `npm run web:deploy` when ready); for pipeline changes run optimizer then full `npm run web:deploy` and confirm on live site.
