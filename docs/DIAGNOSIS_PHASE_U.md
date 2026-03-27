# Phase U — Copy Explore link control

## Purpose

One-click **Copy link** on Explore so operators can share the current **Phase T** URL without selecting the address bar.

## Assumptions

- `window.location.href` is already in sync with Explore state via Phase T `replaceState` (except immediate frame after a change — acceptable).
- Clipboard API or `execCommand` fallback matches existing `copyToClipboard` behavior.

## Files inspected

- `web-dashboard/src/App.tsx` (`copyToClipboard`, Explore layout)

## Files changed

- `web-dashboard/src/App.tsx` — **Copy link** button on Explore; reuses `copyStatus` with short feedback
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_U.md`

## Behavior

- **Explore** only: button above the primary/secondary tabs; copies full current URL; success or failure message in the existing sidebar feedback area (same `copyStatus` as other copy actions).

## Validation

- `npm run build` in `web-dashboard/`

## Next phase (one recommendation)

**Phase V — `popstate` sync:** when the operator uses browser **Back/Forward**, re-read `parseExploreUrl` / `dashboardPageFromSearch` and apply to React state so history navigation matches the URL (Phase T only updates the URL on state change today).
