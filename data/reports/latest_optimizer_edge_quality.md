# Optimizer edge quality audit

- **Generated (UTC):** 2026-03-31T21:59:15.361Z
- **Output status:** **thin** · degraded=true
- **Summary:** optimizer_edge_quality: status=thin degraded=1 total_exported=2 flags=1

## Thresholds
- cardEvFloor=0.008 highEvBar=0.07
- cardEvFloor matches export MIN_CARD_EV / CLI; highEvBar aligns with Telegram high-EV digest (not a policy gate).

## Fragility flags
- few_exported_cards

## Explainability
- PP: 2 exported (pool 6 pre-cap). Top EV 0.7930; top-1 share of top-5 sum 1.000.
- PP: 2 card(s) above high-EV bar (same scale as digest).

## PP
- exported: 2 · pool: 6
- top EVs: 0.7930, 0.7644
- top1/top5-sum: 1.000 · drop 1→5: —

## UD
_No exported cards._

