# Merge quality

- **Overall severity:** **WARN**
- **Explanation:** One or more WARN rules triggered; merge pipeline did not fail (Phase 41 enforcement is reporting-only unless wired to exit).
- **Generated (UTC):** 2026-03-31T21:59:09.987Z
- **Source audit (UTC):** 2026-03-31T21:59:09.987Z

## Freshness / drift (Phase 115)

- oddsFetchedAtUtc: 2026-03-31T21:51:15.675Z
- mergeWallClockUtc: 2026-03-31T21:59:09.987Z
- oddsIsFromCache: true
- oddsSnapshotAgeMinutes: 7.56635
- mergeVsFetchSkewMinutes: 7.9052
- Odds snapshot age uses OddsSnapshotManager-reported minutes when available (coarse clock). mergeVsFetchSkewMinutes≈7.9 (wall clock; trust snapshot age if skew looks wrong).

## Live merge quality (Phase 115)

- match_rate_pp: 0.3758
- match_rate_ud: 0.7375
- unmatched_legs_count: 2568
- alias_resolution_rate: 0.0095
- dropped_due_to_missing_market (no_match): 520
- dropped_due_to_line_diff (line_mismatch): 1340
- odds_unmatched_inventory_rows: 4388
- nearest_match_share (line drift proxy): 0.2704
- explicit_alias_resolution_hits: 39
- multi_book_consensus_pick_count: 611
- last_merge_pass=prizepicks

## Identity / alias visibility (Phase 115)

- explicitAliasResolutionHits: 39
- multiBookConsensusPickCount: 611
- Unresolved player identity and no_candidate concentration: latest_merge_player_diagnostics.json. multi_book_consensus_pick_count is sharp-weight multi-book merges, not a name-collision detector.

## PP consensus (Phase P — reporting only)

- nPpMerged: 1546
- meanConsensusBookCount: 1.5686
- meanDevigSpreadOver: 0.008723 (de-vig prob units)
- p95DevigSpreadOver: 0.040323
- shareMultiBookConsensus: 39.52%
- Per-leg: `ppNConsensusBooks`, `ppConsensusDevigSpreadOver` on merged/ leg CSV when PP.

## Metrics

| mergeCoverage | dropRate | fallbackRate | exactMatchRate | matched | dropped | rawProps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.3526 | 0.6474 | 0.2917 | 0.7296 | 1546 | 2839 | 4385 |

## Severity rules triggered

- **[WARN]** `baseline_coverage_drift_warn`: coverageDeltaVsBaseline=-0.6474 < threshold=-0.1
- **[WARN]** `invalid_odds_drop_share_warn`: invalid_odds dropShare=0.2494 > warnMax=0.12

## Legacy soft guard flags (ok/warn)

- coverage: **ok**
- fallback: **ok**
- invalid_odds drop share: **warn**

- [invalid_odds] dropShare=0.2494 > warnMax=0.12 (invalid_odds=708/2839)

## Audit validation

- valid: true

## Baseline comparison

- available: true
- coverageDeltaVsBaseline: -0.647434
- fallbackRateDeltaVsBaseline: 0.291721
- baselineCoverageDriftWarn: true

## Drift vs previous audit

- previous available: true
- previous generatedAtUtc: 2026-03-31T21:58:38.615Z
- coverageDelta: null
- fallbackRateDelta: null
- fallbackSpikeWarn: false
- fallbackSpikeFail: false

### Drop reason deltas (canonical)

- combo_label_excluded: 100
- fantasy_excluded: 171
- invalid_odds: 708
- line_mismatch: 1340
- no_match: 520
