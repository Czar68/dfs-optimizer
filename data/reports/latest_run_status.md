# DFS Optimizer Run Status

- **Generated (UTC):** 2026-03-28T03:16:35.643Z
- **Run timestamp:** 2026-03-27T23:16:00 ET
- **Success:** true
- **Outcome:** early_exit
- **Run health:** partial_completion
- **Early exit reason:** insufficient_eligible_legs
- **Degradation reasons:** 2

- **PrizePicks:** picks=0 cards=0 tier1=0 tier2=0
- **Underdog:** picks=4 cards=0 tier1=0 tier2=0
- **Digest:** generated=false shown=null deduped=null

**Live merge input (Phase 115)**
- severity: WARN
- liveInputDegraded: true
- match_rate_pp=0.3206 match_rate_ud=0.3609 unmatched_legs=170 alias_rate=0.0000 drop_no_market=13 drop_line_diff=144
- status file: data/reports/merge_quality_status.json

**Optimizer edge quality (Phase 117)**
- status: empty · degraded=true
- optimizer_edge_quality: status=empty exported=0
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
- PP card generation skipped (insufficient eligible legs).
- Telegram high-EV digest is not persisted as a file (chat-only).
