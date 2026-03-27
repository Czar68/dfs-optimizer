# Phase X — Diagnostics URL smoke (Playwright)

## Purpose

One browser test that **`?page=diagnostics`** loads the diagnostics shell: **Live input quality** and **Match coverage quality** (stable `data-testid`s), with empty/partial synced data allowed.

## Assumptions

- Same Playwright **webServer** as Explore / canonical samples (`playwright.config.ts`).
- `LiveInputQualityPanel` always renders a section with `data-testid="live-input-quality-panel"` (loading, empty, or populated).

## Files inspected

- `tests/playwright/explore_url_state_smoke.spec.ts` (pattern)
- `web-dashboard/src/App.tsx` (`match-coverage-diagnostics`)
- `web-dashboard/src/components/OptimizerStatePanels.tsx` (`LiveInputQualityPanel` on `variant === 'diagnostics'`)

## Files changed

- `tests/playwright/diagnostics_url_state_smoke.spec.ts` — new
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_X.md`
- `docs/OPERATIONS_RUNBOOK.md` — verification line mentions diagnostics smoke

## Behavior (product)

- None (test-only).

## Validation

- `npx playwright test tests/playwright/diagnostics_url_state_smoke.spec.ts`

## Next phase (one recommendation)

**Phase Y — Overview URL smoke:** one Playwright test for default `/` (Overview) asserting a stable overview landmark (e.g. `OptimizerStatePanels` overview-only block or operator verdict strip) so all three IA routes have route-level coverage.
