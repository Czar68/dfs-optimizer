# Merge quality

- **Overall severity:** **WARN**
- **Explanation:** One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit).
- **Generated (UTC):** 2026-03-28T23:55:05.595Z
- **Source audit (UTC):** 2026-03-28T23:55:05.595Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-28T23:47:39.753Z
- mergeWallClockUtc: 2026-03-28T23:55:05.595Z
- oddsIsFromCache: true
- oddsSnapshotAgeMinutes: 7.2187
- mergeVsFetchSkewMinutes: 7.4307
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈7.4 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.3891
- match_rate_ud: 0.2232
- unmatched_legs_count: 456
- alias_resolution_rate: 0.0000
- dropped_due_to_missing_market (no_match): 129
- dropped_due_to_line_diff (line_mismatch): 290
- odds_unmatched_inventory_rows: 2723
- nearest_match_share (line drift proxy): 0.0534
- explicit_alias_resolution_hits: 0
- multi_book_consensus_pick_count: 53
- last_merge_pass=underdog; use merge_platform_quality_by_pass.json for PP match_rate_pp when platform=both.

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 0
- multiBookConsensusPickCount: 53
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- (no PP merged rows in this audit pass)

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.2232 | 0.7768 | 0.3740 | 0.9466 | 131 | 456 | 587 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.7768 < threshold=-0.1
- **[WARN]** `coverage_below_warn`: mergeCoverage=0.2232 < warnMin=0.35
- **[WARN]** `drift_fallback_spike_warn`: fallbackRateDelta=0.2411 >= warnDelta=0.15

## Legacy soft guard flags (ok/warn)

- coverage: **warn**
- fallback: **ok**
- invalid_odds drop share: **ok**

- [coverage] mergeCoverage=0.2232 < warnMin=0.35

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.776831
- fallbackRateDeltaVsBaseline: 0.374046
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-28T23:54:58.384Z
- coverageDelta: -0.154792
- fallbackRateDelta: 0.241053
- fallbackSpikeWarn: true
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- combo_label_excluded: -14
- fantasy_excluded: -45
- invalid_odds: -163
- line_mismatch: -497
- no_match: -112
