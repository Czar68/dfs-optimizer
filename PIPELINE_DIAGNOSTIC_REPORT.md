# Pipeline Diagnostic Report

**Generated:** 2026-03-11 (post run + verification)  
**Pipeline:** `.\scripts\run_optimizer.ps1 -Force -NoGuardrails`  
**Verification:** `npm run verify:breakeven`, `npm run test:unit`

---

## 1. Run Status

| Check | Result |
|-------|--------|
| **Pipeline execution** | **Success** |
| **verify:breakeven** | **Passed** |
| **test:unit** | **1 failed, 51 passed** (1 test suite failed) |

The full production pipeline completed successfully (exit code 0). The script wrote `artifacts/last_run.json` with `status: "success"` and metrics. Breakeven verification passed (UD_2P_STD 53.45%, PP 6F 54.21%). One E2E test failed; all other unit and E2E tests passed.

---

## 2. Errors Encountered

### 2.1 Unit test failure (e2e_real_data.spec.ts)

**Test:** `generate --platform pp produces prizepicks_imported.csv with >1000 rows and real NBA players (no synth Haliburton)`

**Assertion:**
```text
expect(fs.existsSync(PP_IMPORTED)).toBe(true);
Expected: true
Received: false
```

**Location:** `tests/e2e_real_data.spec.ts:22`

**Cause:** The test runs `npm run generate -- --platform pp --no-require-alt-lines --no-guardrails` and then expects `prizepicks_imported.csv` at the project root (`path.join(ROOT, 'prizepicks_imported.csv')`). The file was not present there after the command, so either:
- `generate` writes the file to a different path (e.g. under `data/` or `data/output_logs/`), or
- The generate run failed or timed out before writing the file.

No stack trace beyond the assertion; the test fails at the first `expect` (file existence).

### 2.2 Jest worker teardown warning

```text
A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.
```

This indicates a possible timer or handle leak in one of the test files (e.g. polling, intervals, or open connections). It does not change the pass/fail outcome but can slow or destabilize the test run.

### 2.3 Pipeline / logs

- No runtime errors in the pipeline log (`artifacts/logs/run_20260311-185720.txt`).
- `[CONFIG CHECK]` and Odds API merge completed; Sheets push and Telegram send reported success.

---

## 3. CSV and artifact summary

| Artifact | Status | Notes |
|----------|--------|--------|
| **artifacts/last_run.json** | Present, `status: "success"` | Metrics: pp_legs=15, ud_cards=0, tier1=0, tier2=6, sheets_pushed=true, telegram_sent=true |
| **data/output_logs/prizepicks-legs.csv** | Present | 15 data rows (per run) |
| **data/output_logs/prizepicks-cards.csv** | Present | Header + 0 rows (no +EV PP cards this run) |
| **data/output_logs/underdog-cards.csv** | Present | Script reported ud_cards=0 for this run (header only or overwritten by later run) |
| **data/output_logs/tier1.csv** | Present | Header only when Tier1=0 (no Tier-1 innovative cards) |
| **data/output_logs/tier2.csv** | Present | Header + 6 data rows; schema valid (portfolioRank, tier, site, flexType, cardEV, leg IDs, runTimestamp, etc.) |

**CSV malformation:** None. `tier1.csv` and `tier2.csv` have correct headers and structure. Empty `tier1` (header only) is expected when no cards meet Tier-1 criteria (e.g. EV ≥ 8% + Kelly threshold).

---

## 4. Recommended Fixes

### 4.1 e2e_real_data.spec.ts — prizepicks_imported.csv path

**Issue:** Test expects `prizepicks_imported.csv` at project root; the file may be written elsewhere by `npm run generate`.

**Options (pick one):**

1. **Align test with actual output path**  
   - Find where `generate` (e.g. `scripts/run-generate.js` or the code it calls) writes `prizepicks_imported.csv`.  
   - Set `PP_IMPORTED` in the test to that path (e.g. `path.join(ROOT, 'data', 'output_logs', 'prizepicks_imported.csv')` or a path from `src/constants/paths.ts`), or resolve it via the same constant the app uses.

2. **Align generate with test**  
   - If the product contract is “imported CSV at repo root”, change the generate script so it writes `prizepicks_imported.csv` to the project root (e.g. after running, or by config).

3. **Skip when file not produced**  
   - If generate is optional or environment-dependent, consider skipping the test when the file is missing and documenting that (e.g. `it.skip` or conditional `existsSync` with a clear message) so CI doesn’t fail on environments that don’t run generate.

**Suggested next step:** Grep for writes to `prizepicks_imported` / `PP_IMPORTED_CSV` in the code invoked by `npm run generate` and set `PP_IMPORTED` in the test to that path (or export a helper from the app that returns the path).

### 4.2 Jest worker / open handles

**Issue:** Worker did not exit gracefully; possible timers or open handles in tests or app code.

**Recommendations:**

- Run Jest with `--detectOpenHandles` to see which handles or timers are left open.
- In tests that start intervals or timeouts (e.g. polling), call `.unref()` on the timer or clear it in an `afterEach`/`afterAll`.
- If a test starts a server or long-running process, ensure it is stopped and connections closed in a `afterAll` or similar teardown.

### 4.3 Optional: document empty tier1 / ud_cards

- When the slate yields no Tier-1 innovative cards, `tier1.csv` is header-only; when UD export is empty, `ud_cards` can be 0. This is expected. Consider a short note in the docs or in the script’s artifact report (e.g. in the markdown written beside `last_run.json`) so “0 tier1” or “0 ud_cards” is clearly interpreted as “no qualifying cards” rather than failure.

---

## 5. Summary

| Item | Status |
|------|--------|
| Production pipeline run | Success |
| verify:breakeven | Passed |
| test:unit | 1 failed (e2e_real_data), 51 passed |
| artifacts/last_run.json | success |
| CSV data (tier1, tier2, legs, cards) | Present and well-formed; tier1/ud empty when no qualifying cards |
| Recommended fixes | (1) Fix e2e_real_data path for prizepicks_imported.csv, (2) Fix Jest teardown/handles, (3) Optional doc for empty tier1/ud_cards |
