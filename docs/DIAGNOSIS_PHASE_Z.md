# Phase Z — Dashboard Playwright smokes note

## Purpose

Central, skim-friendly pointer to the **three IA route smokes** and how to run them (no new automation).

## Assumptions

- `playwright.config.ts` at repo root; `tests/playwright/*.spec.ts` includes canonical samples **plus** Overview / Explore / Diagnostics route specs.

## Files inspected

- `docs/CURRENT_STATE.md`, `docs/OPERATIONS_RUNBOOK.md`
- `tests/playwright/overview_url_state_smoke.spec.ts`, `explore_url_state_smoke.spec.ts`, `diagnostics_url_state_smoke.spec.ts`

## Files changed

- **`web-dashboard/README.md`** — new short README: table of three smokes + `npx playwright test` examples + umbrella command
- **`docs/OPERATIONS_RUNBOOK.md`** — Verification cross-link to that README
- **`docs/CURRENT_STATE.md`**, **`docs/DIAGNOSIS_PHASE_Z.md`**

## Behavior

- Documentation only.

## Validation

- Not applicable (docs-only). Optional manual check: open `web-dashboard/README.md` for broken paths.

## Next phase (one recommendation)

**Resume pipeline/product work** as needed; extend Playwright only when a new dashboard route or critical UI contract appears—avoid growing browser surface without cause.
