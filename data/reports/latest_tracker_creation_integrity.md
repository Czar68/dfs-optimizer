# Tracker creation-time integrity (Phase 69)

Generated: 2026-03-22T00:15:21.952Z
Schema: 1

## Creation-tagged rows (`creationTimestampUtc` present)
- rowsCreated: **0**
- rowsCreatedFullyCalibratable (creation contract): **0**
- creationCalibratableRate: **0.00%**

| Field / rate | Coverage (tagged) |
|---|---:|
| platform | 0.00% |
| gameStartTime (valid) | 0.00% |
| trueProb | 0.00% |
| implied or open-odds context | 0.00% |
| projectedEV | 0.00% |

## Legacy rows (no creation tag)
- Count: **22**

## Full inventory (all rows) — creation contract
- totalRows: **22**
- meetingCreationContract: **6** (27.27%)

## Primary reason — tagged but not creation-calibratable
| Reason | Count |
|---|---:|
| missing_platform | 0 |
| missing_game_start | 0 |
| missing_true_prob | 0 |
| missing_implied_or_open_odds_context | 0 |
| missing_projected_ev | 0 |

## Creation provenance aggregate (tagged rows)
| key=value | Count |
|---|---:|

## Operator guidance
- Creation contract: platform (grounded), valid gameStartTime, trueProb, impliedProb or open-odds context, projectedEV.
- Backfill path (`buildPerfTrackerRowFromTierLeg`) sets creationTimestampUtc, creationSource, creationProvenance, selectionSnapshotTs from tier run.
- Preserve tier/legs CSV archives under data/tier_archive and data/legs_archive per existing repo practice so historical leg_id joins remain available.
- Rows without creationTimestampUtc are legacy; new appends from backfill should be tagged.
