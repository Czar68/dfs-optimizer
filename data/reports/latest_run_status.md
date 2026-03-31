# DFS Optimizer Run Status

- **Generated (UTC):** 2026-03-31T21:59:15.366Z
- **Run timestamp:** 2026-03-31T17:58:49 ET
- **Success:** true
- **Outcome:** full_success
- **Run health:** degraded_success
- **Degradation reasons:** 2

- **PrizePicks:** picks=94 cards=2 tier1=2 tier2=0
- **Underdog:** picks=0 cards=0 tier1=0 tier2=0
- **Digest:** generated=true shown=2 deduped=2

**Live merge input (Phase 115)**
- severity: WARN
- liveInputDegraded: true
- match_rate_pp=0.3758 match_rate_ud=0.7375 unmatched_legs=2568 alias_rate=0.0095 drop_no_market=520 drop_line_diff=1340
- status file: data/reports/merge_quality_status.json

**Optimizer edge quality (Phase 117)**
- status: thin · degraded=true
- optimizer_edge_quality: status=thin degraded=1 total_exported=2 flags=1
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
