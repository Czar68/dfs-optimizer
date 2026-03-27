# Calibration surface (resolved legs)

Generated: 2026-03-22T00:15:22.037Z
Schema: 1

## Definitions
- **predictedEdge:** trueProb − impliedProb (fraction); requires both fields on the row.
- **predictedEv:** projectedEV from tracker (leg EV at selection).
- **winRate:** fraction of resolved legs with result === 1.
- **realizedReturnProxy:** Mean of rowRealizedProfitPerUnit (stake=1 American payout); unavailable legs excluded from mean only.
- **trackerIntegrity:** Grounded impliedProb coverage and perf_tracker enrichment: see data/reports/latest_tracker_integrity.json (Phase 67).

## Row counts
- Total rows in file: 22
- Resolved legs: 16
- Resolved with site PP/UD (inferred if needed): 16
- Resolved with structure field: 7
- Resolved with leg count from structure registry: 7

## By site
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PP | 16 | 50.00% | -3.523% | 7 | 6.003% | 16 | -0.7593 | 7 |

## By structure (flexType / structureId)
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 6P | 7 | 14.29% | -3.523% | 7 | 7.149% | 7 | -0.7593 | 7 |
| unknown | 9 | 77.78% | — | 0 | 5.112% | 9 | — | 0 |

## By flex kind (Power / Flex / Standard)
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Power | 7 | 14.29% | -3.523% | 7 | 7.149% | 7 | -0.7593 | 7 |
| unknown | 9 | 77.78% | — | 0 | 5.112% | 9 | — | 0 |

## By leg count
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 | 7 | 14.29% | -3.523% | 7 | 7.149% | 7 | -0.7593 | 7 |
| unknown | 9 | 77.78% | — | 0 | 5.112% | 9 | — | 0 |

## By predicted edge bucket
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| <2% | 7 | 14.29% | -3.523% | 7 | 7.149% | 7 | -0.7593 | 7 |
| 2–4% | 0 | — | — | 0 | — | 0 | — | 0 |
| 4–6% | 0 | — | — | 0 | — | 0 | — | 0 |
| 6–8% | 0 | — | — | 0 | — | 0 | — | 0 |
| 8%+ | 0 | — | — | 0 | — | 0 | — | 0 |
| edge_unavailable | 9 | 77.78% | — | 0 | 5.112% | 9 | — | 0 |

## By predicted EV bucket
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| <2% | 0 | — | — | 0 | — | 0 | — | 0 |
| 2–4% | 4 | 75.00% | — | 0 | 3.130% | 4 | — | 0 |
| 4–6% | 3 | 66.67% | -3.401% | 2 | 5.523% | 3 | -0.1575 | 2 |
| 6–8% | 8 | 37.50% | -3.574% | 4 | 7.162% | 8 | -1.0000 | 4 |
| 8%+ | 1 | 0.00% | -3.563% | 1 | 9.673% | 1 | -1.0000 | 1 |
| ev_unavailable | 0 | — | — | 0 | — | 0 | — | 0 |

## By site × edge bucket
| Slice | N | Win rate | Avg pred edge | Edge n | Avg pred EV | EV n | ROI proxy | ROI n |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PP|<2% | 7 | 14.29% | -3.523% | 7 | 7.149% | 7 | -0.7593 | 7 |
| PP|2–4% | 0 | — | — | 0 | — | 0 | — | 0 |
| PP|4–6% | 0 | — | — | 0 | — | 0 | — | 0 |
| PP|6–8% | 0 | — | — | 0 | — | 0 | — | 0 |
| PP|8%+ | 0 | — | — | 0 | — | 0 | — | 0 |
| PP|edge_unavailable | 9 | 77.78% | — | 0 | 5.112% | 9 | — | 0 |
| UD|<2% | 0 | — | — | 0 | — | 0 | — | 0 |
| UD|2–4% | 0 | — | — | 0 | — | 0 | — | 0 |
| UD|4–6% | 0 | — | — | 0 | — | 0 | — | 0 |
| UD|6–8% | 0 | — | — | 0 | — | 0 | — | 0 |
| UD|8%+ | 0 | — | — | 0 | — | 0 | — | 0 |
| UD|edge_unavailable | 0 | — | — | 0 | — | 0 | — | 0 |
| unknown|<2% | 0 | — | — | 0 | — | 0 | — | 0 |
| unknown|2–4% | 0 | — | — | 0 | — | 0 | — | 0 |
| unknown|4–6% | 0 | — | — | 0 | — | 0 | — | 0 |
| unknown|6–8% | 0 | — | — | 0 | — | 0 | — | 0 |
| unknown|8%+ | 0 | — | — | 0 | — | 0 | — | 0 |
| unknown|edge_unavailable | 0 | — | — | 0 | — | 0 | — | 0 |

## Notes
- Only legs with result in {0,1} are included (resolved).
- predictedEdge = trueProb − impliedProb when both are present on the row; otherwise edge bucket = edge_unavailable.
- predictedEv = projectedEV (leg-level EV at selection).
- realizedReturnProxy = mean per-leg profit at stake=1 from American open/chosen odds when available; otherwise basis count < sampleCount.
- Site uses row.platform when set; else inferred from leg_id prefix (prizepicks / underdog).
