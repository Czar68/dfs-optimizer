# Canonical sample artifacts — dashboard / product consumers

## Source of truth

- **Committed JSON:** `artifacts/samples/sample_cards_pp.json`, `sample_cards_ud.json`, `sample_summary.json`
- **Contract:** `schemaVersion` + `phase20_canonical_sample_v1` (see `src/reporting/canonical_sample_contract.ts`)

Regenerate after fixture or generator changes:

```bash
npm run generate:canonical-samples
npm run verify:canonical-samples
```

## Node / tooling

Use **`loadCanonicalSampleArtifactsReadOnly(cwd)`** from `src/reporting/canonical_sample_artifacts_consumer.ts` — read-only, fails on missing files, invalid JSON, or contract mismatch.

## Minimal UI (Phase 23)

With the dashboard dev server or static build, open:

`/?view=canonical-samples` (e.g. `http://localhost:5173/?view=canonical-samples` in dev)

This renders a **read-only** panel that loads `public/data/canonical_samples/*.json` via `fetchCanonicalSampleArtifactsForDashboard` and displays `formatCanonicalSamplesPanelLines` (no mock data on failure).

## Static dashboard (Vite)

Browsers cannot read the repo `artifacts/` tree. Copy the same bytes into the static tree:

```bash
npm run sync:canonical-samples-dashboard
```

This writes `web-dashboard/public/data/canonical_samples/*.json` (identical to `artifacts/samples/`).

In the React app, **`fetchCanonicalSampleArtifactsForDashboard()`** in `web-dashboard/src/lib/canonicalSamples.ts` loads and validates those files (shared **`parseCanonicalSampleArtifactsFromJson`** from `src/reporting/canonical_sample_artifacts_validate.ts`). There is **no** fallback to mock data on failure.

## CI

- **`npm run verify:canonical-samples`** — drift guard for `artifacts/samples/`
- After changing canonical samples, run **`sync:canonical-samples-dashboard`** and commit `web-dashboard/public/data/canonical_samples/` if the dashboard should serve the new snapshot offline.

## Troubleshooting

If **`/?view=canonical-samples`** shows an error in the dashboard:

- Confirm **`web-dashboard/public/data/canonical_samples/*.json`** exists (run **`npm run sync:canonical-samples-dashboard`** from the repo root after **`artifacts/samples/`** is up to date).
- If validation fails, regenerate **`artifacts/samples/`** with **`npm run generate:canonical-samples`**, re-run **`npm run verify:canonical-samples`**, then sync to the dashboard again.

### Browser test fixture (Phase 29)

For **Playwright** error-state coverage only, **`?view=canonical-samples&canonicalSamplesFixture=missing`** selects a dedicated fetch base; the consumer **throws the same 404-shaped error** as a missing **`sample_cards_pp.json`** (Vite preview can return **200** + HTML for unknown paths, so the dashboard does not rely on raw HTTP status for this fixture). Normal use omits **`canonicalSamplesFixture`**.

### Playwright UI smoke (`npm run verify:canonical-samples:ui-smoke`) — Phase 30

- **What it does:** Builds **`web-dashboard`**, runs **`vite preview`** on **`127.0.0.1`**, then runs **`tests/playwright/*.spec.ts`** (canonical samples happy + error-fixture paths). **No** writes to **`artifacts/samples/`** or **`web-dashboard/public/data/canonical_samples/`**.

- **Default port:** **`4173`**, shared by **`webServer`** and test **`baseURL`** (see **`playwright.preview.port.ts`** / **`playwright.config.ts`**).

- **Override port** (e.g. **4173** already in use):

  ```bash
  # bash
  PLAYWRIGHT_PREVIEW_PORT=4174 npm run verify:canonical-samples:ui-smoke
  ```

  ```powershell
  # PowerShell
  $env:PLAYWRIGHT_PREVIEW_PORT = "4174"; npm run verify:canonical-samples:ui-smoke
  ```

- **Local vs `CI`:** When **`CI`** is **unset** (normal local run), Playwright may **reuse** an already-running preview on the **same** port if **`PW_DISABLE_PREVIEW_REUSE`** is not set to **`1`**. When **`CI`** is set (e.g. GitHub Actions), the config **always starts a fresh** preview server — **4173** (or **`PLAYWRIGHT_PREVIEW_PORT`**) must be free. If you run with **`CI=1` locally** and see “port already used”, either **unset `CI`**, **stop** the other listener, **change port** with **`PLAYWRIGHT_PREVIEW_PORT`**, or set **`PW_DISABLE_PREVIEW_REUSE=1`** to force a new server on a free port after choosing a new **`PLAYWRIGHT_PREVIEW_PORT`**.
