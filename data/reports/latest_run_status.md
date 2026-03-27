# DFS Optimizer Run Status

- **Generated (UTC):** 2026-03-27T19:33:27.378Z
- **Run timestamp:** 2026-03-27T15:32:38 ET
- **Success:** true
- **Outcome:** full_success
- **Run health:** degraded_success
- **Degradation reasons:** 2

- **PrizePicks:** picks=24 cards=400 tier1=139 tier2=215
- **Underdog:** picks=30 cards=400 tier1=14 tier2=386
- **Digest:** generated=true shown=10 deduped=518

**Live merge input (Phase 115)**
- severity: WARN
- liveInputDegraded: true
- match_rate_pp=0.8750 match_rate_ud=0.3682 unmatched_legs=381 alias_rate=0.0083 drop_no_market=125 drop_line_diff=193
- status file: data/reports/merge_quality_status.json

**Optimizer edge quality (Phase 117)**
- status: moderate · degraded=true
- optimizer_edge_quality: status=moderate degraded=1 total_exported=800 flags=1
- file: data/reports/latest_optimizer_edge_quality.json

**Artifacts**
- prizepicks cards: prizepicks-cards.csv
- underdog cards: underdog-cards.csv
- prizepicks picks: prizepicks-legs.csv
- underdog picks: underdog-legs.csv
- telegram digest file: null

**Degradation Reasons**
- live_input_degraded
- optimizer_output_degraded

**Notes**
- Telegram high-EV digest is not persisted as a file (chat-only).
