# Merge quality

- **Overall severity:** **WARN**
- **Explanation:** One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit).
- **Generated (UTC):** 2026-03-28T03:16:10.303Z
- **Source audit (UTC):** 2026-03-28T03:16:10.303Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-28T03:16:04.534Z
- mergeWallClockUtc: 2026-03-28T03:16:10.303Z
- oddsIsFromCache: false
- oddsSnapshotAgeMinutes: 0
- mergeVsFetchSkewMinutes: 0.09615
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈0.1 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.3206
- match_rate_ud: 0.3609
- unmatched_legs_count: 170
- alias_resolution_rate: 0.0000
- dropped_due_to_missing_market (no_match): 13
- dropped_due_to_line_diff (line_mismatch): 144
- odds_unmatched_inventory_rows: 1460
- nearest_match_share (line drift proxy): 0.0000
- explicit_alias_resolution_hits: 0
- multi_book_consensus_pick_count: 28
- last_merge_pass=underdog; use merge_platform_quality_by_pass.json for PP match_rate_pp when platform=both.

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 0
- multiBookConsensusPickCount: 28
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- (no PP merged rows in this audit pass)

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.2857 | 0.7143 | 0.0833 | 1.0000 | 96 | 240 | 336 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.7143 < threshold=-0.1
- **[WARN]** `coverage_below_warn`: mergeCoverage=0.2857 < warnMin=0.35

## Legacy soft guard flags (ok/warn)

- coverage: **warn**
- fallback: **ok**
- invalid_odds drop share: **ok**

- [coverage] mergeCoverage=0.2857 < warnMin=0.35

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.714286
- fallbackRateDeltaVsBaseline: 0.083333
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-28T03:16:06.749Z
- coverageDelta: -0.034886
- fallbackRateDelta: 0.049291
- fallbackSpikeWarn: false
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- escalator_filtered: 70
- invalid_odds: -11
- line_mismatch: -622
- no_match: -193
