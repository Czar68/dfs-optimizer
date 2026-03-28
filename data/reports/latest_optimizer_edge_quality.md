# Optimizer edge quality audit

- **Generated (UTC):** 2026-03-28T21:52:55.889Z
- **Output status:** **moderate** · degraded=true
- **Summary:** optimizer_edge_quality: status=moderate degraded=1 total_exported=400 flags=1

## Thresholds
- cardEvFloor=0.008 highEvBar=0.07
- cardEvFloor matches export MIN_CARD_EV / CLI; highEvBar aligns with Telegram high-EV digest (not a policy gate).

## Fragility flags
- heavy_leg_reuse_top_slice

## Explainability
- PP: 400 exported (pool 681 pre-cap). Top EV 2.2548; top-1 share of top-5 sum 0.233.
- PP: 400 card(s) above high-EV bar (same scale as digest).
- Same leg keys repeat across the top exported slice — correlated risk.

## PP
- exported: 400 · pool: 681
- top EVs: 2.2548, 1.9550, 1.9128, 1.8100, 1.7533
- top1/top5-sum: 0.233 · drop 1→5: 0.5015

## UD
_No exported cards._

