# Phase T — Shareable Explore state (URL query params)

## Purpose

Persist **Explore Legs** tab/triage state in the URL so operators can bookmark or paste a link and reproduce the same leg view without changing pipeline behavior.

## Assumptions

- Share target is the operator dashboard (same origin); `view=canonical-samples` / `view=admin` and other unknown query keys are left intact.
- Initial hydrate applies explore params **only when** `page=explore` (so `tab=` alone with default page does not change Overview).

## Files inspected

- `docs/CURRENT_STATE.md`, `web-dashboard/src/App.tsx`, `web-dashboard/src/components/DashboardPageNav.tsx`

## Files changed

- `web-dashboard/src/lib/exploreUrlState.ts` — parse / sync / strip helpers for explore-only keys
- `web-dashboard/src/App.tsx` — boot hydrate from URL, `navigateDashboardPage` strips explore keys off Explore, `useEffect` sync on Explore
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_T.md`

## URL contract (minimal / stable)

| Param       | When set | Default (omitted from URL) |
|------------|----------|----------------------------|
| `page`     | Already Phase 134; `explore` \| `diagnostics`; absent ⇒ Overview | — |
| `tab`      | Explore only | `must_play` |
| `legsTop`  | Top legs tabs only | `50` |
| `legsSort` | Top legs only; `sortKey:sortDir` | `edge:desc` |
| `ppFocus`  | Top legs only | `any` |
| `legsStat` | Top legs only | `All` |
| `legsGame` | Top legs only | `All` |

Non–top-legs Explore tabs drop `legsTop`, `legsSort`, `ppFocus`, `legsStat`, `legsGame` from the URL. Leaving **Overview** or **Diagnostics** removes all explore-only keys.

## Validation

- `npm run build` in `web-dashboard/`

## Next phase (one recommendation)

**Phase U — Copy Explore link control:** a single **Copy link** control on Explore (e.g. beside Top N) that copies the current `window.location.href` after sync so operators do not rely on manual address-bar selection.
