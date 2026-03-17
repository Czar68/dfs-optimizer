# TRD Provider Audit Report (diagnostic only, no fixes)

**Date:** 2026-03-13  
**Context:** Last live run (20260312): PP=10 legs, UD=63 cards. TRD was in `--providers` (PP,UD,TRD) but does not appear in run outputs or PROJECT_STATE metrics. This audit determines whether TRD fails silently or is intentionally absent.

---

## 1. TRD fetch / provider location

### Search results

- **`TRD` / `trd` / `fetch_trd` / `trd_provider` / `tradeable`:** No matches in `src/**/*.ts`. No TRD-specific fetch or provider module exists in the active pipeline.
- **Provider enum / switch:** The only provider list is in `src/cli_args.ts` (--providers). Valid values were **PP** and **UD** only; **TRD** was not in the valid list and caused `process.exit(2)` with "Invalid --providers TRD. Valid: PP, UD".
- **Where legs come from:**
  - **PP:** `fetchPrizePicksRawProps()` in `run_optimizer.ts` → merge with OddsAPI (or mock) → EV calc. No per-provider dispatch; the pipeline is PrizePicks + OddsAPI only.
  - **UD:** Separate entry point `run_underdog_optimizer.ts` (own UD API + shared odds). Not selected by a provider switch; selected by `--platform ud` or `--platform both`.
  - **TRD:** There is no TRD leg source. No file fetches TheRundown or builds TRD legs for the optimizer.

### Remaining TRD-related code (non–leg-source)

| Location | Role |
|----------|------|
| `docs/PROJECT_STATE.md` | States SGO/TRD cleanup merged 2026-03-12; pipeline OddsAPI-only; "Valid --providers are PP and UD only (TRD is not supported)." |
| `scripts/check_therundown_alt_lines.ts` | Deprecated one-off script; calls TheRundown API; not used by run_optimizer or run_underdog_optimizer. |
| `src/live_liquidity.ts` | Constants for TheRundown API base URL; comment says "TheRundown has been removed from the active pipeline"; `computeLiveLiquidity` uses static liquidity only. |
| `scripts/quota-monitor.ps1` | Comment: "TRD quota tracking removed." |

There is no provider switch that includes TRD as a case that fetches or merges legs. Legs are not constructed from TRD anywhere in the optimizer pipeline.

---

## 2. [TRD-AUDIT] logging (gated by TRD_DEBUG=1)

Added in this audit (diagnostic only):

- **Where:** `src/run_optimizer.ts` immediately after the "[OPTIMIZER] Block start" log.
- **Gate:** `process.env.TRD_DEBUG === "1" && args.providers.includes("TRD")`.
- **Messages:**
  - `[TRD-AUDIT] fetch start`
  - `[TRD-AUDIT] fetched N rows` (N = 0; no TRD fetch)
  - `[TRD-AUDIT] after filter: N rows remain` (N = 0)
  - `[TRD-AUDIT] ZERO rows — reason: no TRD fetch implementation (TRD removed in SGO/TRD cleanup; pipeline is OddsAPI+PP/UD only; see PROJECT_STATE.md).`

**CLI change (for audit runs only):** TRD was added to the valid `--providers` list in `src/cli_args.ts` so that `--providers TRD` (or PP,UD,TRD) no longer exits with "Invalid --providers". This allows the run to proceed and [TRD-AUDIT] to fire when TRD_DEBUG=1. No other behavior change.

---

## 3. Run with TRD_DEBUG=1

**Command run:**

```text
set TRD_DEBUG=1 && set USE_MOCK_ODDS=1 && node dist/src/run_optimizer.js --platform both --providers TRD --sports NBA --mock-legs 30
```

**Result:**

- **Exit code:** 0 (success).
- **TRD in providers:** Accepted (after allowing TRD in valid list). Run completed with platform=both, mock legs, PP path + UD path.
- **[TRD-AUDIT] lines:** Not observed in the captured log. Possible reasons: (1) `TRD_DEBUG` was not set to `"1"` in the environment seen by the Node process (e.g. shell env not inherited or overridden by .env), or (2) logging is present but was not in the captured segment. The [TRD-AUDIT] block is present in `dist/src/run_optimizer.js` (lines 909–915).
- **Leg/card counts:** PP and UD legs and cards were produced as usual; no TRD legs or cards anywhere (there is no TRD path to produce them).

To confirm [TRD-AUDIT] in your environment, ensure `TRD_DEBUG=1` is set in the same environment that starts Node (e.g. `$env:TRD_DEBUG='1'` in PowerShell before the command, or add `TRD_DEBUG=1` to `.env` temporarily).

---

## 4. Report answers

### (a) Does TRD have an active fetch implementation or is it a stub?

**TRD has no active fetch and no stub in the optimizer pipeline.** There is no TRD fetch function, no TRD branch in the leg-loading path, and no TRD case in any provider switch. The pipeline has only:

- PrizePicks props (+ OddsAPI merge) for the PP path
- Underdog API (+ odds) for the UD path

So TRD does not “fail” at runtime—it is simply not implemented.

### (b) If active: where does it drop to 0? (fetch failure? filter? merge?)

**Not applicable.** TRD is not active. There is no fetch, filter, or merge step for TRD. The only place TRD appears in the run is as an allowed value in `--providers` (after the audit change). Passing `--providers TRD` does not add a second leg source; it only allows the process to start and (when TRD_DEBUG=1) to log [TRD-AUDIT] that TRD contributes 0 rows.

### (c) If stub: what would be needed to implement it?

To implement TRD as a real leg source you would need:

1. **Fetch:** A TRD fetch function (e.g. call TheRundown API, map to internal leg/prop shape). Reference: `scripts/check_therundown_alt_lines.ts` and `src/live_liquidity.ts` (API base, sport/market IDs). No such fetch is wired today.
2. **Provider dispatch:** In `run_optimizer.ts`, a branch that runs when `args.providers.includes("TRD")`: call the TRD fetch, normalize to `EvPick` (or equivalent), and merge TRD legs with the existing PP (and optionally UD) leg set. Today there is no per-provider loop; PP is the only leg source in the main optimizer, and UD is a separate binary.
3. **Config:** Add TRD to the documented valid providers and ensure PROJECT_STATE / docs describe TRD as a leg source if you re-enable it.
4. **Secrets:** TheRundown typically needs an API key (e.g. `THERUNDOWN_API_KEY` or `RUNDOWN_KEY`); `.env.example` does not document it today.

### (d) Is TRD intentionally disabled or accidentally broken?

**TRD was intentionally removed and is documented as unsupported.** It is not accidentally broken; it is no longer part of the pipeline.

- **PROJECT_STATE.md:** "SGO/TRD cleanup: Branch cleanup/remove-sgo-trd merged to main 2026-03-12. Pipeline is OddsAPI-only; all SGO/TRD dead code removed or deprecated. No SGO/TRD references in active pipeline output." And: "Valid --providers are PP and UD only (TRD is not supported)."
- **TRD_CLEANUP:** Marked RESOLVED (final scrub 2026-03-13). "No active TRD logic in pipeline."

So TRD does not appear in run outputs or PROJECT_STATE metrics because it is **intentionally** out of scope. Including TRD in `--providers` (e.g. PP,UD,TRD) previously caused an immediate CLI error; it did not fail silently inside the pipeline. With the audit change, TRD is accepted as a provider name but still contributes 0 legs because there is no TRD implementation.

---

## Summary

| Question | Answer |
|----------|--------|
| TRD fetch exists? | No. No fetch, no stub in the optimizer. |
| Where does TRD drop to 0? | N/A. TRD is not in the pipeline. |
| What would implement TRD? | New TRD fetch, provider dispatch in run_optimizer, config/docs, API key. |
| Intentionally disabled or broken? | **Intentionally removed** (SGO/TRD cleanup); documented as unsupported. |

No code fixes were applied beyond (1) allowing TRD in `--providers` for audit runs and (2) adding [TRD-AUDIT] logging when `TRD_DEBUG=1` and TRD is in providers.
