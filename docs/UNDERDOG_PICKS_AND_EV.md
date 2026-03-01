# Underdog picks and EV math

Why Underdog can show fewer picks than PrizePicks, and how break-even / EV are computed.

## 1. Break-even and card EV math (verified)

### Leg-level “edge” (shared with PrizePicks)

- **trueProb** = devigged over probability from the matched sportsbook (SGO/TheRundown).
- **edge** = `trueProb - 0.5` (used for ranking; break-even at 50% in this simplified view).
- **legEv** = `edge` (same as edge; used for filtering and card building).

So both Underdog and PrizePicks use the same leg EV formula. The **card** EV uses each site’s payout table.

### Underdog Standard (all-or-nothing)

For a card with `n` legs and payout multiplier `M` (e.g. 2-pick 3.5×):

- **EV** = `p₁·p₂·…·pₙ · M − 1` (assuming stake 1).
- With equal leg probability `p`: **EV** = `p^n · M − 1`.
- **Break-even**: `p^n · M = 1` → **p** = `(1/M)^(1/n)`.

Examples in code (see `underdog_structures.ts`):

- 2-pick 3.5×: p = (1/3.5)^(1/2) ≈ **53.45%**
- 3-pick 6.5×: p = (1/6.5)^(1/3) ≈ **53.58%**
- 6-pick 35×: p = (1/35)^(1/6) ≈ **54.66%**

### Underdog Flex (tiered payouts)

Flex uses the **full hit distribution** (DP over leg probabilities), not a single all-hit term:

- **EV** = Σₖ P(k hits) × payout(k) × stake − stake.
- `computeHitDistribution()` in `underdog_card_ev.ts` builds P(0), P(1), …, P(n) from each leg’s `trueProb`.
- `computeCardEvFromPayouts()` then multiplies by the structure’s payout table (e.g. 3F: 3.25× all, 1.09× for 2 hits).

Pre-computed **break-even leg win rates** in config (e.g. 3F ≈ 55%, 6F ≈ 53.1%, 8F ≈ 51%) are from solving EV = 0 numerically; they are for reference. The **actual card EV** is always computed from the full distribution and payouts, so the math is correct even if break-even is approximate.

### Summary

- **Leg EV / edge**: Same as PrizePicks (`trueProb - 0.5`).
- **Standard card EV**: Correct all-or-nothing formula; break-even = (1/M)^(1/n).
- **Flex card EV**: Correct hit-distribution + tiered payouts; break-evens in config are numerical approximations.

No bugs were found in the Underdog break-even or EV formulas.

---

## 2. Why Underdog can have fewer picks

The pipeline is:

1. **Raw props** (Underdog API / scrape / manual).
2. **Merge** with same odds as PrizePicks (SGO or TheRundown): match by player, stat, line (within 1), league.
3. **EV** = `calculateEvForMergedPicks(merged)` (same as PP).
4. **Filters**: drop non-standard odds (optional), legEv &lt; 2%, then at most 1 leg per (player, stat).

Reasons you can see fewer Underdog legs than PrizePicks:

| Stage | What happens | How to check |
|-------|----------------|--------------|
| **Raw count** | Underdog may expose fewer props than PrizePicks for the same slate. | Compare “Raw PrizePicks props” vs UD raw count in logs. |
| **Merge rate** | Same odds feed for both. If Underdog uses different player names or stat labels, more UD props fail to match and are dropped. | `[UD] Pick funnel: raw=N → merged=M` and merge log `no_candidate=X, line_diff=Y, juice=Z`. |
| **Non-standard odds** | Legs with `isNonStandardOdds === true` are removed unless `UD_INCLUDE_NON_STANDARD_ODDS=true`. | Log “Filtered out X non-standard legs”. |
| **Leg EV floor** | Both use a 2% leg EV floor (UD: `UNDERDOG_GLOBAL_LEG_EV_FLOOR`, PP: `MIN_LEG_EV`). | Same threshold; not a source of difference. |
| **Player/stat cap** | Underdog keeps at most 1 leg per (player, stat). PrizePicks uses 1 leg per player (across all stats). | UD is *more* permissive here; not why UD would be lower. |

So the main levers are: **raw Underdog slate size** and **merge rate** (naming/stat/line alignment with the odds feed). The merge report and `merge_audit_report.md` (from the morning audit) help find naming/stat fixes.

---

## 3. Merge logs and where Underdog fails

With **`EXPORT_MERGE_REPORT=1`** set (as in the default pipeline):

- The merge step logs **`[Underdog]`** or **`[PrizePicks]`** so you can see which run each line refers to.
- It writes **`merge_report_underdog.csv`** and **`merge_report_prizepicks.csv`** (plus `merge_report.csv` = latest run). Each row has `site`, `player`, `stat`, `line`, `sport`, `matched`, `reason`, `bestOddsLine`, `bestOddsPlayerNorm`.
- After the run, **`npm run audit-merge`** produces **`merge_audit_report.md`** with:
  - **Underdog failure breakdown** – total, matched, no_candidate, line_diff, juice and **where Underdog fails most** (top reason).
  - **By site** – side-by-side Underdog vs PrizePicks counts when both reports exist.

So you can see at a glance whether Underdog is failing mainly on **no_candidate** (names/stats not in odds), **line_diff** (line &gt; 1 away), or **juice** (odds too steep).

## 4. Diagnostic logging

When you run the Underdog optimizer you’ll see:

- **`[UD] Pick funnel: raw=N → merged=M (merge rate: X%)`**  
  If the merge rate is much lower than for PrizePicks, focus on player/stat/line matching (aliases, stat mapping, line tolerance).
- **`[UD] Leg funnel: merged UD=A → after filterEvPicks=B → final legs=C`**  
  Shows how many legs remain after EV floor, non-standard filter, and one-per-player/stat.

Compare with PrizePicks logs in the same run: “Raw PrizePicks props”, “Merged picks”, “Legs after edge filter”, “Legs after EV filter”, “Legs after player cap”.

---

## 5. Optional relaxations (if you want more Underdog legs)

- **Include non-standard odds**  
  Set `UD_INCLUDE_NON_STANDARD_ODDS=true` before running so legs with varied multipliers are kept (they still use the same EV math; only the “standard” filter is bypassed).
- **Lower leg EV floor**  
  In `src/config/underdog_structures.ts`, reduce `UNDERDOG_GLOBAL_LEG_EV_FLOOR` (e.g. from 0.02 to 0.015). This adds more legs but with smaller edge; use with care.
- **Improve merge rate**  
  Use `merge_report.csv` / `merge_audit_report.md` and add `PLAYER_NAME_ALIASES` (and stat/line handling) so more Underdog props match the odds feed.

---

## 6. Where the math lives

- **Leg EV / edge**: `src/calculate_ev.ts` (shared).
- **Underdog break-even constants**: `src/config/underdog_structures.ts` (`breakEvenLegWinRate` per structure).
- **Underdog card EV**: `src/underdog_card_ev.ts` (`computeHitDistribution`, `computeCardEvFromPayouts`, `evaluateUdStandardCard`, `evaluateUdFlexCard`).
- **Underdog leg/card filters**: `src/run_underdog_optimizer.ts` (`filterEvPicks`, `meetsUnderdogLegEvFloor`) and `src/config/underdog_structures.ts` (`UNDERDOG_GLOBAL_LEG_EV_FLOOR`, `canLegsMeetStructureThreshold`).
