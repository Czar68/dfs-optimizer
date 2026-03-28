# Merge quality

- **Overall severity:** **WARN**
- **Explanation:** One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit).
- **Generated (UTC):** 2026-03-28T21:52:05.171Z
- **Source audit (UTC):** 2026-03-28T21:52:05.171Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-28T21:16:41.002Z
- mergeWallClockUtc: 2026-03-28T21:52:05.171Z
- oddsIsFromCache: true
- oddsSnapshotAgeMinutes: 35.11586666666667
- mergeVsFetchSkewMinutes: 35.402816666666666
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈35.4 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.3032
- match_rate_ud: 0.2402
- unmatched_legs_count: 484
- alias_resolution_rate: 0.0204
- dropped_due_to_missing_market (no_match): 158
- dropped_due_to_line_diff (line_mismatch): 267
- odds_unmatched_inventory_rows: 3689
- nearest_match_share (line drift proxy): 0.0654
- explicit_alias_resolution_hits: 13
- multi_book_consensus_pick_count: 96
- last_merge_pass=underdog; use merge_platform_quality_by_pass.json for PP match_rate_pp when platform=both.

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 13
- multiBookConsensusPickCount: 96
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- (no PP merged rows in this audit pass)

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.2402 | 0.7598 | 0.3333 | 0.9346 | 153 | 484 | 637 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.7598 < threshold=-0.1
- **[WARN]** `coverage_below_warn`: mergeCoverage=0.2402 < warnMin=0.35
- **[WARN]** `invalid_odds_drop_share_warn`: invalid_odds dropShare=0.1219 > warnMax=0.12

## Legacy soft guard flags (ok/warn)

- coverage: **warn**
- fallback: **ok**
- invalid_odds drop share: **warn**

- [coverage] mergeCoverage=0.2402 < warnMin=0.35
- [invalid_odds] dropShare=0.1219 > warnMax=0.12 (invalid_odds=59/484)

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.759812
- fallbackRateDeltaVsBaseline: 0.333333
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-28T21:51:56.936Z
- coverageDelta: -0.046929
- fallbackRateDelta: 0.060965
- fallbackSpikeWarn: false
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- combo_label_excluded: -38
- fantasy_excluded: -102
- invalid_odds: -260
- line_mismatch: -429
- no_match: -574
