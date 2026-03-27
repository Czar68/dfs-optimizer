# Operator dashboard (Vite)

Props / legs UI under `web-dashboard/`. **Build:** `npm run build`. **Data:** sync from repo root with `npm run sync:dashboard-reports` (see `docs/OPERATIONS_RUNBOOK.md`).

## Route-level Playwright smokes (IA)

Production build + `vite preview` via repo root `playwright.config.ts` (port from `playwright.preview.port.ts`; see Phase 30 notes in `docs/CANONICAL_SAMPLES_DASHBOARD.md`).

| Spec | Route / focus |
|------|----------------|
| `tests/playwright/overview_url_state_smoke.spec.ts` | Default **`/`** — Overview status strip (`overview-status-strip`). |
| `tests/playwright/explore_url_state_smoke.spec.ts` | **`?page=explore`** — Top Legs PP + `legsTop`, **`goBack()`** restoration. |
| `tests/playwright/diagnostics_url_state_smoke.spec.ts` | **`?page=diagnostics`** — Live input quality + match coverage landmarks. |

**Run all Playwright tests** (includes canonical samples UI + the above):

```bash
cd ..   # repo root
npm run verify:canonical-samples:ui-smoke
```

**Run only the three route smokes:**

```bash
npx playwright test tests/playwright/overview_url_state_smoke.spec.ts tests/playwright/explore_url_state_smoke.spec.ts tests/playwright/diagnostics_url_state_smoke.spec.ts
```

**One file (example):**

```bash
npx playwright test tests/playwright/overview_url_state_smoke.spec.ts
```
