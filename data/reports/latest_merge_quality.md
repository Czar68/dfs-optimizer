# Merge quality

- **Overall severity:** **FAIL**
- **Explanation:** One or more FAIL rules triggered (coverage, fallback spike vs previous, or invalid audit).
- **Generated (UTC):** 2026-03-29T00:38:11.234Z
- **Source audit (UTC):** 2026-03-29T00:38:11.234Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-28T23:47:39.753Z
- mergeWallClockUtc: 2026-03-29T00:38:11.234Z
- oddsIsFromCache: true
- oddsSnapshotAgeMinutes: 50.31565
- mergeVsFetchSkewMinutes: 50.524683333333336
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈50.5 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.3005
- match_rate_ud: 0.1842
- unmatched_legs_count: 536
- alias_resolution_rate: 0.0000
- dropped_due_to_missing_market (no_match): 239
- dropped_due_to_line_diff (line_mismatch): 275
- odds_unmatched_inventory_rows: 2733
- nearest_match_share (line drift proxy): 0.0909
- explicit_alias_resolution_hits: 0
- multi_book_consensus_pick_count: 57
- last_merge_pass=underdog; use merge_platform_quality_by_pass.json for PP match_rate_pp when platform=both.

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 0
- multiBookConsensusPickCount: 57
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- (no PP merged rows in this audit pass)

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.1842 | 0.8158 | 0.2810 | 0.9091 | 121 | 536 | 657 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.8158 < threshold=-0.1
- **[FAIL]** `coverage_below_fail`: mergeCoverage=0.1842 < failMin=0.22

## Legacy soft guard flags (ok/warn)

- coverage: **warn**
- fallback: **ok**
- invalid_odds drop share: **ok**

- [coverage] mergeCoverage=0.1842 < warnMin=0.35

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.815830
- fallbackRateDeltaVsBaseline: 0.280992
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-29T00:38:04.947Z
- coverageDelta: -0.110872
- fallbackRateDelta: 0.143014
- fallbackSpikeWarn: false
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- combo_label_excluded: -12
- fantasy_excluded: -33
- invalid_odds: -133
- line_mismatch: -534
- no_match: -501
