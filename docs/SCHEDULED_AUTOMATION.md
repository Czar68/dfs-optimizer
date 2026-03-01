# Scheduled automation (4 slots)

## Slots (_auto_window.ps1)

| Slot      | Time window        |
|-----------|--------------------|
| morning   | 9:00 AM – 10:00 AM |
| afternoon | 1:00 PM – 2:00 PM  |
| evening   | 6:00 PM – 7:00 PM  |
| overnight | 10:00 PM – 1:30 PM next day |

- `Test-AutoWindow` (no args): returns true if current time is in **any** slot.
- `Test-AutoWindow -Slot all`: same as above (in any slot).
- `Test-AutoWindow -Slot morning|afternoon|evening|overnight`: true only in that slot.
- Outside all slots: scripts no-op unless `-Force`.

## Run at slot start

- **nightly_maint.ps1** runs in every slot: use `-Force` when invoked by scheduler so it always runs (e.g. `nightly_maint.ps1 -Force`).
- **run_optimizer.ps1** runs without `-Force` at slot start so it only runs when inside a slot.

## Task Scheduler (Windows) – 4 tasks

Use one task per slot. Replace `C:\path\to\nba-props-optimizer` with your repo path.

**Morning (9:00 AM daily)**

```xml
<Task>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T09:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-ExecutionPolicy Bypass -NoProfile -File "C:\path\to\nba-props-optimizer\scripts\nightly_maint.ps1" -Force</Arguments>
      <WorkingDirectory>C:\path\to\nba-props-optimizer</WorkingDirectory>
    </Exec>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-ExecutionPolicy Bypass -NoProfile -File "C:\path\to\nba-props-optimizer\scripts\run_optimizer.ps1"</Arguments>
      <WorkingDirectory>C:\path\to\nba-props-optimizer</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
```

**Afternoon (1:00 PM daily)** – same as above, change `StartBoundary` to `2026-01-01T13:00:00` and run same two commands.

**Evening (6:00 PM daily)** – same, `StartBoundary` to `2026-01-01T18:00:00`.

**Overnight (10:00 PM daily)** – same, `StartBoundary` to `2026-01-01T22:00:00`.

Create via: **Task Scheduler → Create Task → Triggers (one per slot) → Actions (two: nightly_maint -Force, then run_optimizer).**

## 6PM / auto-run failures (SGO quota, alt-lines)

If **evening (6PM)** or other slots fail with SGO quota or alt-lines errors:

1. **Check logs**: `netlify logs` (Netlify) or Task Scheduler history / `schtasks /query /tn "dfs-optimizer"` (Windows).
2. **Fix**: run-both.ps1 and daily-run.ps1 already pass **--no-require-alt-lines** so scheduled runs do not hard-fail when alt-lines are missing (downgrades to warning).
3. **Cron/Netlify**: Use the same flags in your cron or Netlify build command, e.g.  
   `npm run generate -- --platform both --bankroll 600 --no-require-alt-lines`
4. **Restart**: Redeploy on Netlify or run `npm run schedule` (if you have a schedule script); ensure the run command includes `--no-require-alt-lines`.

## Test matrix

| Test | Expected |
|------|----------|
| `run_optimizer.ps1 -Force` | Full pipeline runs; sheets pushed; telegram sent; `artifacts/last_run.json` has `status":"success"` and metrics (pp_legs, ud_cards, sheets_pushed, telegram_sent). |
| `Test-AutoWindow -Slot all` | Returns true when current time is in any of the 4 slots (9–10, 13–14, 18–19, 22–next day 13:30). |
| `nightly_maint.ps1 -Force` | Git status + npm test + TODO grep; `artifacts/nightly_report_*.md` written. |
| `run_optimizer.ps1 -DryRun` | No pipeline; `artifacts/last_run.json` has `status":"dry_run_ok"`. |
| `verify_wiring.ps1 -Flow all` | DryRun; `artifacts/last_run.json` exists; script exits 0. |
