# Optimizer edge quality audit

- **Generated (UTC):** 2026-03-27T19:33:27.376Z
- **Output status:** **moderate** · degraded=true
- **Summary:** optimizer_edge_quality: status=moderate degraded=1 total_exported=800 flags=1

## Thresholds
- cardEvFloor=0.008 highEvBar=0.07
- cardEvFloor matches export MIN_CARD_EV / CLI; highEvBar aligns with Telegram high-EV digest (not a policy gate).

## Fragility flags
- heavy_leg_reuse_top_slice

## Explainability
- PP: 400 exported (pool 695 pre-cap). Top EV 0.9607; top-1 share of top-5 sum 0.209.
- PP: 400 card(s) above high-EV bar (same scale as digest).
- UD: 400 exported (pool 1060 pre-cap). Top EV 1.2083.
- Same leg keys repeat across the top exported slice — correlated risk.

## PP
- exported: 400 · pool: 695
- top EVs: 0.9607, 0.9497, 0.9320, 0.9037, 0.8553
- top1/top5-sum: 0.209 · drop 1→5: 0.1054

## UD
- exported: 400 · pool: 1060
- top EVs: 1.2083, 1.1764, 1.1764, 1.1764, 1.1764
- top1/top5-sum: 0.204 · drop 1→5: 0.0320

