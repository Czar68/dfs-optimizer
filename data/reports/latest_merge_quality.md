# Merge quality

- **Overall severity:** **WARN**
- **Explanation:** One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit).
- **Generated (UTC):** 2026-03-24T21:04:37.311Z
- **Source audit (UTC):** 2026-03-24T21:04:37.311Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-24T20:18:41.851Z
- mergeWallClockUtc: 2026-03-24T21:04:37.311Z
- oddsIsFromCache: true
- oddsSnapshotAgeMinutes: null
- mergeVsFetchSkewMinutes: 45.92433333333334
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈45.9 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.8750
- match_rate_ud: 0.3682
- unmatched_legs_count: 381
- alias_resolution_rate: 0.0083
- dropped_due_to_missing_market (no_match): 125
- dropped_due_to_line_diff (line_mismatch): 193
- odds_unmatched_inventory_rows: 2943
- nearest_match_share (line drift proxy): 0.0000
- explicit_alias_resolution_hits: 5
- multi_book_consensus_pick_count: 159
- last_merge_pass=underdog; use merge_platform_quality_by_pass.json for PP match_rate_pp when platform=both.

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 5
- multiBookConsensusPickCount: 159
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- (no PP merged rows in this audit pass)

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.2782 | 0.7218 | 0.0000 | 1.0000 | 222 | 576 | 798 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.7218 < threshold=-0.1
- **[WARN]** `coverage_below_warn`: mergeCoverage=0.2782 < warnMin=0.35

## Legacy soft guard flags (ok/warn)

- coverage: **warn**
- fallback: **ok**
- invalid_odds drop share: **ok**

- [coverage] mergeCoverage=0.2782 < warnMin=0.35

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.721805
- fallbackRateDeltaVsBaseline: 0.000000
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-24T21:04:36.309Z
- coverageDelta: 0.000000
- fallbackRateDelta: 0.000000
- fallbackSpikeWarn: false
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- (none)
