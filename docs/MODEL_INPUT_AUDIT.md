# Model-input audit (Phases 16M / 16V)

This document describes **persisted data** used for calibration / future ML work. It is **not** a model spec and does not change EV math.

## 1. `data/perf_tracker.jsonl` (append-only JSONL)

**Purpose:** Per-leg historical rows for book calibration, bucket calibration, merge guardrails, and backtests.

**Raw / selection fields (typical):**

| Field | Meaning |
|--------|--------|
| `date` | Slate / game date `YYYY-MM-DD` |
| `leg_id` | Stable leg identifier (often encodes OVER/UNDER) |
| `player`, `stat`, `line`, `book` | Match context |
| `trueProb`, `projectedEV`, `playedEV` | Model-facing EV at selection |
| `kelly`, `card_tier` | Sizing / tier metadata |
| `overOdds`, `underOdds`, `side`, `impliedProb`, `oddsBucket` | Odds-aware calibration (optional) |
| `platform`, `structure` | PP vs UD and slip / structure id |

**Phase 16N — modeling / CLV (optional; never fabricated):**

| Field | Meaning |
|--------|--------|
| `playerId` | Deterministic id: `pid_<hash>` from `league` + normalized player name |
| `marketId` | Deterministic id: `mid_<hash>` from league + player + stat + line |
| `statNormalized` | Lowercase underscore token for stat |
| `openOddsAmerican` | Chosen-side American odds at selection (from CSV / backfill) |
| `closeOddsAmerican` | Closing American odds for chosen side when captured |
| `openImpliedProb` | Vigged implied probability from `openOddsAmerican` (`americanToImpliedProb`) |
| `closeImpliedProb` | Vigged implied from closing odds when present |
| `clvDelta` | `closeImpliedProb − openImpliedProb` when **both** present |
| `clvPct` | `(clvDelta / openImpliedProb) × 100` when `openImpliedProb > 0` |
| `selectionSnapshotTs` | Reserved for future writer alignment |
| `gameStartTime`, `team`, `opponent`, `homeAway` | Context when available |

**CLV definition (Phase 16N):**

- Uses **market implied** probabilities from American odds (vigged), not model `trueProb`.
- **Open** = at selection / backfill time from leg CSV odds.
- **Close** = when a downstream job fills `closeOddsAmerican` / `closeImpliedProb` (not auto-fabricated in core pipeline).
- If close is missing, `clvDelta` / `clvPct` are omitted.

**Outcome fields:**

| Field | Meaning |
|--------|--------|
| `result` | `0` / `1` hit when resolved |
| `scrape_stat` | Box-score actual (when scraped) |
| `hist_mult` | Reserved for calibration multiplier |

**Still missing / future:**

- Full raw Odds API event payload per leg (only normalized odds fields when present).
- Automated closing-line fetch before every game (structure ready; data optional).
- Injury / minutes priors.
- External league player IDs (we use deterministic hashes instead).

## 2. `data/tracking/pending_cards.json` + `history.json`

**Purpose:** Web dashboard tracker — graded **cards** (slips) with per-leg Win/Loss/Push.

**Phase 16M:** `structureId`, `kellyStakeUsd`, `legKey`.

**Phase 16N (per leg, optional on old files):**

| Field | Meaning |
|--------|--------|
| `playerId`, `marketId` | Same deterministic scheme as perf_tracker |
| `openOddsAmerican`, `openImpliedProb`, `openProbModel` | Market vs model prob at save time |
| `closeOddsAmerican`, `closeImpliedProb` | Filled when available |
| `clvDelta`, `clvPct` | Only when open+close implied both set |
| `selectionSnapshot` | `{ book, oddsAmerican, line, statNormalized, timestampIso }` at selection |
| `gameStartTime`, `team`, `opponent`, `homeAway` | From `EvPick` when present |

**Outcome:** leg-level `result`; realized card return remains Phase 16M (`structureId` + `parlay_structures`).

## 3. Model export

**Script:** `npm run export:model-data` → `artifacts/model_dataset.jsonl` (override with `--out`).

**Contents:** One JSON object per line: `perf_tracker.jsonl` rows (wrapped as `{ source, row }`) plus flattened legs from `pending_cards.json` / `history.json` when present.

## 4. Closing-line reconciliation (Phase 16O)

**Script:** `npm run reconcile:clv`

**Rule (deterministic and conservative):**

1. Use the latest odds snapshot with `fetchedAtUtc <= gameStartTime`.
2. Match by stable `marketId` (fallback: player + stat + line + league) and chosen side.
3. Accept close only when chosen-side odds in that snapshot are unique (or all equal).
4. If multiple chosen-side odds exist in the same close snapshot, mark ambiguous and skip.
5. If no pre-start snapshot exists, skip. Post-start data is never used.

**Rerun behavior:**

- Additive and safe to rerun.
- Existing `closeOddsAmerican` is preserved by default.
- `--force-recompute` allows explicit recalculation.

**Populated fields on success:**

- `closeOddsAmerican`, `closeImpliedProb`, `clvDelta`, `clvPct`

## 5. Snapshot accumulation + coverage (Phase 16P)

**Script:** `npm run capture:snapshot`

**What it captures:**

- Lightweight normalized rows from `data/odds_cache.json` into `data/odds_snapshots/OddsAPI_*.json`
- Fields kept per row: `league`, `player`, `stat`, `line`, `overOdds`, `underOdds`, `book`
- Metadata: `fetchedAtUtc` (from cache timestamp), `capturedAtUtc`, row count, hash

**Compatibility with 16O:**

- Snapshot files are directly consumable by `reconcile:clv` (same key fields and `fetchedAtUtc` semantics).
- Rerun-safe: if the exact same `fetchedAtUtc + rows hash` file already exists, capture skips.

**Game-time coverage:**

- Tracker save now backfills `gameStartTime` from existing legs CSV files when `pick.startTime` is missing.
- No guessed timestamps: if absent in both sources, field remains empty.

**Recommended lightweight CLV workflow:**

1. Run optimizer / scanner to produce legs/cards.
2. Run `npm run capture:snapshot` periodically into lock.
3. Run `npm run reconcile:clv`.
4. Run `npm run export:model-data`.

## 6. Model evaluation export (Phase 16Q)

**Script:** `npm run export:model-eval`

**Artifacts:**

- `artifacts/model_evaluation.json`
- `artifacts/model_evaluation.md`

**What is evaluated (truthful, additive):**

- Only resolved leg rows from `data/perf_tracker.jsonl` (`result` in `{0,1}`).
- Push/unresolved/ambiguous rows are excluded from calibration/scoring.
- Calibration buckets are deterministic fixed bins: `[0.45,0.50)`, `[0.50,0.55)`, `[0.55,0.60)`, `[0.60,0.65)`, `[0.65,0.70)`, `[0.70,0.75)`.
- Scoring metrics: Brier score, log loss (with epsilon clipping), average predicted probability, realized hit rate.
- CLV evaluation (where `clvDelta` exists): sample count, avg `clvDelta`, avg `clvPct`, positive-vs-negative CLV hit rate and avg unit profit when open odds are available.
- Segment summaries: platform, stat token, side, structure with sample count, predicted avg, realized hit rate, avg EV, avg CLV delta when present.

**Known limits:**

- CLV comparisons require populated close fields from reconciliation/snapshots; sparse close coverage limits inference.
- Unit-profit comparisons require usable open/chosen-side odds on resolved rows.

## 7. Probability calibration layer (Phase 16R)

**Scripts:**

- `npm run export:calibration` → `artifacts/probability_calibration.json`
- `npm run audit:calibration-impact` → `artifacts/calibration_impact_audit.json`

**Method (minimal, explicit):**

- Uses resolved `perf_tracker.jsonl` rows (`result` in `{0,1}`) with fixed probability buckets from Phase 16Q.
- Buckets below minimum sample size stay in `identity_sparse` mode (raw prob passes through).
- Buckets meeting sample minimum use conservative shrinkage from predicted to realized hit rate, then a monotonic pass.
- Mapping is auditable and deterministic for fixed inputs.

**Raw vs calibrated preservation:**

- Optimizer legs now carry both raw and calibrated fields:
  - `rawTrueProb` (original model output)
  - `trueProb` / `calibratedTrueProb` (post-calibration probability)
  - `probCalibrationApplied`, `probCalibrationBucket`
- Tracker/model export rows include additive fields:
  - `rawProbModel`, `calibratedProbModel`, `probCalibrationApplied`, `probCalibrationBucket`

**Activation behavior:**

- Calibration is controlled by artifact flag `activeInOptimizer`.
- Default generation is conservative (`activeInOptimizer: false`) so this phase is auditable before broad activation.
- When active, calibrated probability flows through the existing canonical EV path; formulas are unchanged.

**Known limitations:**

- Current row counts may be too sparse for many buckets; identity fallback is expected.
- Impact audit is a diagnostics layer and should be read with sample-size context.

## 8. Optimizer CSV / tier archives

**Purpose:** Reproducible runs in `data/output_logs/`, `data/legs_archive/`, `data/tier_archive/` — used by `backfill_perf_tracker.ts` and human review.

**Not duplicated here** — see `docs/PROJECT_STATE.md` CSV schemas.

---

*Reporting rollups (Phase 16M) use graded tracker cards; CLV fields are additive and do not change rollup math.*

## 11. Start-time recovery + pre-start snapshot coverage (Phase 16U)

**Scripts:**

- `npx ts-node src/backfill_perf_tracker.ts` (now includes start-time enrichment pass for existing `perf_tracker.jsonl` rows)
- `npm run export:snapshot-gaps` → `artifacts/snapshot_coverage_gaps.json` + `.md`

**Additional start-time source used (additive):**

- `data/output_logs/underdog-legs.json` and `data/output_logs/prizepicks-legs.json` when present.
- Recovery is deterministic and conservative:
  - Prefer exact `leg_id` matches.
  - Fallback to normalized `player + stat + line` only when candidate start times are non-conflicting.
  - Conflicting candidate times are skipped; no guessing.
  - Existing tracker `gameStartTime` is never overwritten.

**Snapshot-gap artifact purpose:**

- Reports rows missing `gameStartTime`.
- Reports rows with start time but no valid pre-start snapshot.
- Separately reports rows that are post-start-only (still excluded by CLV rule).
- Includes enrichment counts and per-source contribution counts.

**Operational use:**

1. Run optimizer/scanner.
2. Run `npm run capture:snapshot` before lock.
3. Run `npm run export:snapshot-gaps` to see at-risk rows.
4. Run `npm run reconcile:clv`, then model exports.

**Why post-start-only rows still remain excluded:**

- Phase 16O truth rule remains unchanged: close odds must come from snapshots at or before start time. Post-start snapshots are never used to fabricate close/CLV.

## 12. Ops coverage playbook + final metadata harvest (Phase 16V)

**Scripts:**

- `npm run export:ops-playbook` → `artifacts/ops_coverage_playbook.json` + `.md`
- Included in `npm run refresh:model-artifacts`

**Newly harvested historical source (minimal normalization):**

- `data/oddsapi_today.json`
  - Uses `playerName + statType + line + commenceTime` only as a fallback start-time candidate source.
  - Still conservative: start-time fill requires non-conflicting candidate times, and existing `gameStartTime` values are never overwritten.
  - `team/opponent` from this source are only used when not `UNK`.

**Operational playbook artifact provides:**

- Current readiness status + blockers (from real readiness computation).
- Current coverage and snapshot-gap counts.
- Source audit classification for historical metadata files.
- Priority-ranked action plan tied to current blockers.
- Top row-level action list (`missing_start_time`, `needs_pre_start_snapshot`, `post_start_only`, `already_has_clv`).

**What remains unresolved without future data:**

- Rows still missing trustworthy event start times when no deterministic source exists.
- Rows with only post-start snapshots; these require earlier periodic capture before lock/start.
- Sparse resolved/CLV history remains a data-collection issue, not a formula issue.

## 13. Post-run automation wrapper (Phase 16X)

**Scripts:**

- `scripts/post_run_model_refresh.ps1`
  - Runs:
    1. `npm run capture:snapshot`
    2. `npm run refresh:model-artifacts`
  - Writes append-only JSON-line logs to `data/logs/post_run_model_refresh.log`.
  - Exit behavior:
    - default: nonzero if capture fails or refresh fails
    - optional `-ContinueOnCaptureFailure` to continue into refresh

- `scripts/run_with_post_refresh.ps1`
  - Runs a main command first (`run_optimizer.ps1 -Force` by default).
  - If main command fails: logs failure and skips post-run refresh.
  - If main succeeds: invokes `post_run_model_refresh.ps1`.

**NPM convenience scripts:**

- `npm run postrun:model-refresh`
- `npm run run:with-post-refresh`

**Task Scheduler intent:**

- Use these wrappers as the scheduled target (no scheduler auto-creation in code).
- Keep working directory at repo root so relative paths and artifacts resolve correctly.

**Windows Task Scheduler examples (copy/paste):**

- Program/script:
  - `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
- Start in:
  - `C:\Dev\Projects\dfs-optimizer`
- Arguments (post-run only):
  - `-NoProfile -ExecutionPolicy Bypass -File "C:\Dev\Projects\dfs-optimizer\scripts\post_run_model_refresh.ps1"`
- Arguments (main run + post-refresh):
  - `-NoProfile -ExecutionPolicy Bypass -File "C:\Dev\Projects\dfs-optimizer\scripts\run_with_post_refresh.ps1" -MainCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force"`

**Suggested 4-5 run sequencing:**

1. Early-day run via `run_with_post_refresh.ps1`
2. Midday run via `run_with_post_refresh.ps1`
3. Pre-lock run via `run_with_post_refresh.ps1`
4. Near-lock run via `run_with_post_refresh.ps1`
5. Optional late run via `post_run_model_refresh.ps1` only

## 9. Calibration readiness + coverage automation (Phase 16S)

**Scripts:**

- `npm run export:calibration-readiness` → `artifacts/calibration_readiness.json` + `.md`
- `npm run refresh:model-artifacts` (sequential workflow helper)

**Readiness criteria (deterministic, conservative):**

- Minimum resolved rows overall
- Minimum rows per calibration bucket
- Minimum number of buckets meeting sample threshold
- Minimum CLV-populated rows

**Status outputs:**

- `not_ready`
- `partially_ready`
- `ready`

**Activation recommendation:**

- `keep_disabled` when readiness is below threshold
- `eligible_for_review` only when all criteria pass

**Double gate for calibration activation:**

- Calibration applies only when BOTH are true:
  1) `probability_calibration.json` has `activeInOptimizer: true`
  2) `calibration_readiness.json` is `ready` with `eligible_for_review`
- Otherwise optimizer falls back to raw-prob safe behavior (no sparse calibration application).

**Recommended operational loop:**

1. Optimizer/scanner run
2. `npm run capture:snapshot` (periodic)
3. `npm run reconcile:clv`
4. `npm run refresh:model-artifacts`

## 10. Coverage accumulation + CLV population acceleration (Phase 16T)

**Script:**

- `npm run export:coverage-diagnostics` → `artifacts/coverage_diagnostics.json` + `.md`

**Coverage improvements in this phase:**

- Backfill now reads both current and archived CSV sources:
  - `data/legs_archive/*.csv`
  - `data/tier_archive/*.csv`
  - plus current `tier*.csv` / legs CSVs
- Backfilled perf rows now populate metadata more often when present:
  - `gameStartTime`, `team`, `opponent`
  - `playerId`, `marketId`, `statNormalized`
  - `openOddsAmerican`, `openImpliedProb`, `platform`, `structure`
- CLV matching diagnostics are exported with conservative reason counts (`no_start`, `no_match`, `ambiguous`, `post_start_only`) without weakening match truth rules.

**What still blocks CLV coverage:**

- Missing `gameStartTime` on many historical rows
- No available pre-start matching snapshot for some markets
- Ambiguous chosen-side odds in latest eligible snapshot (correctly skipped)
