# Phase K — PP fair-prob/source alignment hardening

Purpose: apply one minimal upstream PP source-alignment change so more legs can naturally clear min-edge without changing EV formulas, thresholds, ranking, gating, or card-construction behavior.

## What was changed (one focused implementation)

**Codepath:** `src/merge_odds.ts` multi-book consensus block (true-prob formation for merged picks).

**Change:** for `site === 'prizepicks'`, consensus now excludes `PrizePicks` book rows **when at least one non-PP book candidate exists** for the same merged prop candidate set; fallback remains unchanged when PP is the only source.

Rationale: avoid self-referential PP-book anchoring in PP consensus where external market books are available.

## Why this stays within boundaries

- No math-model changes.
- No EV formula changes.
- No threshold/gating/ranking/card-construction changes.
- Only upstream source composition in merge consensus selection.

## Before vs after (same diagnostic shape as Phase J)

Read-only diagnostic run (`fetchPrizePicksRawProps` -> `mergeOddsWithPropsWithMetadata` -> `calculateEvForMergedPicks`) results:

- **Before Phase K (Phase J diagnostic):**
  - `totalEvRows`: 371
  - `below015`: 361
  - `atOrAbove015`: 10
  - dominant slice `fair>=0.50`: `n=284`, `pass=1`, `passRate=0.35%`

- **After Phase K:**
  - `totalEvRows`: 366
  - `below015`: 359
  - `atOrAbove015`: 7
  - dominant slice `fair>=0.50`: `n=277`, `pass=0`, `passRate=0.0%`

## Interpretation

- The implemented source-alignment change worked mechanically (PP book removal from consensus when alternatives exist), but this single adjustment **did not improve** edge survival in the dominant `fair>=0.50` slice.
- The dominant weakness remains broad fair-prob/true-prob alignment pressure across high-volume rows; source-only PP-book exclusion is insufficient by itself.

## Validation commands run

- Read-only attribution command (post-change), identical shape to Phase J:
  - `fetchPrizePicksRawProps(['NBA'])`
  - `mergeOddsWithPropsWithMetadata(...)`
  - `calculateEvForMergedPicks(...)`
  - grouped summary for dominant fair-prob slice and PP-vs-non-PP shares.

## Files changed

- `src/merge_odds.ts`
- `docs/DIAGNOSIS_PHASE_K.md`

## Exact behavior changed

- In PP multi-book consensus only: `consensusBookMatches` now excludes `PrizePicks` rows when non-PP rows are available.
- All downstream EV/filter/selection behavior unchanged.

## Single next phase recommendation

**Phase L — PP fair-prob construction parity audit (implementation)**: enforce a deterministic PP merge-time fair-prob construction rule that prioritizes external-book de-vig parity by stat family/line context (still no threshold tuning), then re-measure `fair>=0.50` slice pass-rate.
