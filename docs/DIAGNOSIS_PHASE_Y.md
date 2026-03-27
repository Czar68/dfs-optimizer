# Phase Y — Overview URL smoke (Playwright)

## Purpose

One browser test that the default route **`/`** (no `page=` query) renders **Overview** — specifically the **`overview-status-strip`** block that is omitted on **Diagnostics** and hidden when **Explore** is active.

## Assumptions

- Same Playwright **webServer** as other dashboard smokes (`playwright.config.ts`).
- `OptimizerStatePanels` with `variant="overview"` always renders **`data-testid="overview-status-strip"`** (partial/empty run status is OK).

## Files inspected

- `tests/playwright/explore_url_state_smoke.spec.ts`, `tests/playwright/diagnostics_url_state_smoke.spec.ts`
- `web-dashboard/src/components/OptimizerStatePanels.tsx` (`overview-status-strip`)

## Files changed

- `tests/playwright/overview_url_state_smoke.spec.ts` — new
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_Y.md`
- `docs/OPERATIONS_RUNBOOK.md` — verification line

## Behavior (product)

- None (test-only).

## Validation

- `npx playwright test tests/playwright/overview_url_state_smoke.spec.ts`

## Next phase (one recommendation)

**Phase Z — `web-dashboard/README.md` (or `docs/`) short “Dashboard Playwright smokes”** table listing the three route tests + one-line run command — completes operator-facing documentation without new automation.
