# Phase W — Playwright smoke for Explore URL state

## Purpose

One browser test that **Explore** loads **`tab`** + **`legsTop`** from the query string (Phase T) and that **Back** restores the prior URL-driven view (Phase V).

## Assumptions

- `playwright.config.ts` webServer (Vite preview on `127.0.0.1` + resolved port) is used; same as canonical samples UI smoke.
- Empty CSVs still render **PP Top Legs (n)** headers in Top Legs view.

## Files inspected

- `playwright.config.ts`, `tests/playwright/canonical_samples_ui_smoke.spec.ts`
- `web-dashboard/src/components/PrimarySecondaryTabs.tsx`

## Files changed

- `tests/playwright/explore_url_state_smoke.spec.ts` — new single test (goto → assert → goto Cards → goBack → assert)
- `web-dashboard/src/components/PrimarySecondaryTabs.tsx` — `data-testid="explore-top-legs-limit"` on the Top N `<select>` (test hook only)
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_W.md`

## Behavior (product)

- No user-visible behavior change except stable `data-testid` for automation.

## Validation

- `npx playwright test tests/playwright/explore_url_state_smoke.spec.ts`
- (full suite) `npm run verify:canonical-samples:ui-smoke` — includes all `tests/playwright/*.spec.ts`

## Next phase (one recommendation)

**Phase X — Diagnostics URL smoke:** one Playwright test for `?page=diagnostics` that asserts a stable diagnostics landmark (e.g. `data-testid="live-input-quality-panel"` or section title) so IA navigation has the same regression guard as Explore.
