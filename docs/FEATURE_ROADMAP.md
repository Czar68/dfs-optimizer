# Feature roadmap

Expansion and product-facing backlog only. **Not** day-to-day operational SSOT — use **`docs/CURRENT_STATE.md`**. Detailed merge-improvement phase write-ups live under **`docs/PHASE_HISTORY.md`** (§ TODO and following `### Phase …` sections).

## Near-term ops / engineering (from prior TODO)

1. Run `npm run verify:canonical` and `scripts/verify_wiring.ps1` regularly before ship.
2. Optional: more MSW / unit coverage for API callers; feature flags in `src/constants/featureFlags.ts`.
3. **Automation gap:** `daily-run` / `run-both` do not archive legs+tier, backfill tracker, or scrape results — either call `run_optimizer.ps1` for those paths or extend automation (see **`docs/PHASE_HISTORY.md`** § AUTOMATION_STATUS).
4. **Task Scheduler:** register **DFS-DailyRun** / **DFS-TrackResults** if you want unattended runs (examples in PHASE_HISTORY § CALIBRATION_STATUS / AUTOMATION_STATUS).

## Dashboard product (historical status table)

| Phase | Status | Notes |
|-------|--------|--------|
| 1–3 | Live | Deeplinks, copy parlay, validation logs |
| 4 | Done | IONOS deploy path; see **`docs/STATUS_ROADMAP.md`** for Phase 4 checklist narrative |
| 5+ | Backlog | Real-time / WebSocket, wider calibration, other sports depth |

## Deploy / hosting

- **IONOS static dashboard:** **`docs/IONOS_DEPLOY_CHECKLIST.md`**, **`docs/STATUS_ROADMAP.md`** (FileZilla summary).
- **Live publish automation:** Phase 133 — **`docs/OPERATIONS_RUNBOOK.md`**.

## Canonical samples / CI

- Drift guard: `npm run verify:canonical-samples`.
- UI smoke: `npm run verify:canonical-samples:ui-smoke` (Playwright).
- Runbook: **`docs/CANONICAL_SAMPLES_DASHBOARD.md`**.
