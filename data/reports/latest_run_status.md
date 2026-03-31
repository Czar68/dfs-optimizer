# DFS Optimizer Run Status

- **Generated (UTC):** 2026-03-31T17:04:36.667Z
- **Run timestamp:** 2026-03-31T13:04:23 ET
- **Success:** false
- **Outcome:** fatal_exit
- **Run health:** hard_failure
- **Fatal reason:** uncaught_run_error
- **Degradation reasons:** 4

- **PrizePicks:** picks=null cards=0 tier1=0 tier2=0
- **Underdog:** picks=null cards=0 tier1=0 tier2=0
- **Digest:** generated=false shown=null deduped=null

**Live merge input (Phase 115)**
- severity: WARN
- liveInputDegraded: true
- match_rate_pp=0.3669 match_rate_ud=0.7375 unmatched_legs=2373 alias_rate=0.0101 drop_no_market=502 drop_line_diff=1390
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
- exception:request to https://api.telegram.org/bot8685062953:AAEfNV4EOe5Mdoyqs5qvIxljdnyb_aD5E4s/sendMessage failed, reason: read ECONNRESET
- fatal:uncaught_run_error
- live_input_degraded
- optimizer_output_degraded

**Notes**
- Telegram high-EV digest is not persisted as a file (chat-only).
