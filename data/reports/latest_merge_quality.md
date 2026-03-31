# Merge quality

- **Overall severity:** **WARN**
- **Explanation:** One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit).
- **Generated (UTC):** 2026-03-31T17:04:35.465Z
- **Source audit (UTC):** 2026-03-31T17:04:35.465Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-31T16:03:57.287Z
- mergeWallClockUtc: 2026-03-31T17:04:35.465Z
- oddsIsFromCache: true
- oddsSnapshotAgeMinutes: 60.4398
- mergeVsFetchSkewMinutes: 60.6363
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈60.6 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.3669
- match_rate_ud: 0.7375
- unmatched_legs_count: 2373
- alias_resolution_rate: 0.0101
- dropped_due_to_missing_market (no_match): 502
- dropped_due_to_line_diff (line_mismatch): 1390
- odds_unmatched_inventory_rows: 3342
- nearest_match_share (line drift proxy): 0.3724
- explicit_alias_resolution_hits: 38
- multi_book_consensus_pick_count: 627
- last_merge_pass=prizepicks

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 38
- multiBookConsensusPickCount: 627
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- nPpMerged: 1375
- meanConsensusBookCount: 1.6225
- meanDevigSpreadOver: 0.010208 (de-vig prob units)
- p95DevigSpreadOver: 0.043338
- shareMultiBookConsensus: 45.60%
- Per-leg: `ppNConsensusBooks`, `ppConsensusDevigSpreadOver` on merged/ leg CSV when PP.

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.3409 | 0.6591 | 0.1476 | 0.6276 | 1375 | 2658 | 4033 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.6591 < threshold=-0.1
- **[WARN]** `coverage_below_warn`: mergeCoverage=0.3409 < warnMin=0.35
- **[WARN]** `invalid_odds_drop_share_warn`: invalid_odds dropShare=0.1810 > warnMax=0.12

## Legacy soft guard flags (ok/warn)

- coverage: **warn**
- fallback: **ok**
- invalid_odds drop share: **warn**

- [coverage] mergeCoverage=0.3409 < warnMin=0.35
- [invalid_odds] dropShare=0.1810 > warnMax=0.12 (invalid_odds=481/2658)

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.659063
- fallbackRateDeltaVsBaseline: 0.147636
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-31T16:57:39.041Z
- coverageDelta: -0.002755
- fallbackRateDelta: 0.009659
- fallbackSpikeWarn: false
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- combo_label_excluded: -10
- fantasy_excluded: -3
- invalid_odds: -19
- line_mismatch: -131
- no_match: -30
