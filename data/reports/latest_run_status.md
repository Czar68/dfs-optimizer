# DFS Optimizer Run Status

- **Generated (UTC):** 2026-03-28T23:55:56.816Z
- **Run timestamp:** 2026-03-28T19:54:52 ET
- **Success:** true
- **Outcome:** full_success
- **Run health:** degraded_success
- **Degradation reasons:** 2

- **PrizePicks:** picks=58 cards=400 tier1=196 tier2=179
- **Underdog:** picks=3 cards=0 tier1=0 tier2=0
- **Digest:** generated=true shown=5 deduped=399

**Live merge input (Phase 115)**
- severity: WARN
- liveInputDegraded: true
- match_rate_pp=0.3891 match_rate_ud=0.2232 unmatched_legs=456 alias_rate=0.0000 drop_no_market=129 drop_line_diff=290
- status file: data/reports/merge_quality_status.json

**Optimizer edge quality (Phase 117)**
- status: moderate · degraded=true
- optimizer_edge_quality: status=moderate degraded=1 total_exported=400 flags=1
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
