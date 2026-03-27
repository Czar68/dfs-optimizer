# Phase V — `popstate` sync for dashboard / Explore URL

## Purpose

On browser **Back** / **Forward**, re-apply **`page`**, **Explore** query params, and **`view=`** from the active history entry so React matches the URL (shared links + history navigation).

## Assumptions

- History entries differ only when the browser stack has more than one entry (e.g. in-app navigation that used `pushState`, external navigation into the app, or full reloads). The existing Phase T flow uses **`replaceState`**, so **intra-SPA tab changes alone** may not create new entries; `popstate` still fires whenever the active entry changes.

## Files inspected

- `web-dashboard/src/App.tsx`, `web-dashboard/src/lib/exploreUrlState.ts`

## Files changed

- `web-dashboard/src/App.tsx` — `readPageAndExploreFromSearch` (shared with boot); `popstate` listener hydrates `dashboardPage`, Explore leg-triage state, `canonicalSamplesView`, `isAdminMetricsView`
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_V.md`

## Behavior

- **`popstate`:** reads `window.location.search` and applies the same mapping as initial load (`readPageAndExploreFromSearch` + `view=` flags).
- **Phase T** `useEffect` still runs after state updates and keeps `replaceState` idempotent when the URL already matches.
- **Default / no history change:** unchanged.

## Validation

- `npm run build` in `web-dashboard/`

## Next phase (one recommendation)

**Phase W — Playwright smoke for Explore URL:** one short test that loads `?page=explore&tab=…` and asserts the active tab / visible surface matches the query (guards Phase T + V regressions without manual clicks).
