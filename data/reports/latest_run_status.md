# DFS Optimizer Run Status

- **Generated (UTC):** 2026-03-28T21:52:55.890Z
- **Run timestamp:** 2026-03-28T17:51:47 ET
- **Success:** true
- **Outcome:** full_success
- **Run health:** degraded_success
- **Degradation reasons:** 2

- **PrizePicks:** picks=51 cards=400 tier1=175 tier2=208
- **Underdog:** picks=7 cards=0 tier1=0 tier2=0
- **Digest:** generated=true shown=5 deduped=398

**Live merge input (Phase 115)**
- severity: WARN
- liveInputDegraded: true
- match_rate_pp=0.3032 match_rate_ud=0.2402 unmatched_legs=484 alias_rate=0.0204 drop_no_market=158 drop_line_diff=267
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
