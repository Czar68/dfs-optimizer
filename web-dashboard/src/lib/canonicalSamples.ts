/**
 * Phase 22 — Browser-facing fetch for canonical sample JSON (served from public/data/canonical_samples after sync).
 * SSOT remains repo-root artifacts/samples/; run: npm run sync:canonical-samples-dashboard
 * Phase 29 — Re-exports fixture resolver for `?canonicalSamplesFixture=missing` (Playwright error-path only).
 * Phase 36 — `CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_*` query param/value stay in
 * `src/reporting/canonical_samples_browser_fixture.ts` only (SSOT). Dashboard code uses `resolveCanonicalSamplesFetchBase` only;
 * Jest/contract tests import fixture constants from `src/reporting/` directly — no duplicate literals here.
 * Phase 37 — If fixture QUERY_PARAM / VALUE_MISSING are needed here, add only to the `export { } from` block below
 * (same module path); see `tests/phase37_canonical_samples_fixture_reexport_readiness.spec.ts`.
 */
import { parseCanonicalSampleArtifactsFromJson } from "@repo/canonical-sample-validate";
import {
  CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE,
  CANONICAL_SAMPLES_PUBLIC_BASE,
} from "../../../src/reporting/canonical_samples_browser_fixture";

export {
  CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE,
  CANONICAL_SAMPLES_PUBLIC_BASE,
  resolveCanonicalSamplesFetchBase,
} from "../../../src/reporting/canonical_samples_browser_fixture";

export type CanonicalSampleDashboardBundle = ReturnType<typeof parseCanonicalSampleArtifactsFromJson>;

export async function fetchCanonicalSampleArtifactsForDashboard(
  baseUrl: string = CANONICAL_SAMPLES_PUBLIC_BASE
): Promise<CanonicalSampleDashboardBundle> {
  /** Phase 29 — Do not rely on real HTTP 404: Vite preview may return 200 + index.html for unknown paths. */
  if (baseUrl === CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE) {
    throw new Error(`[canonical sample dashboard] sample_cards_pp.json HTTP 404`);
  }
  const join = (name: string) => `${baseUrl.replace(/\/?$/, "/")}${name}`;
  const [ppRes, udRes, sumRes] = await Promise.all([
    fetch(join("sample_cards_pp.json")),
    fetch(join("sample_cards_ud.json")),
    fetch(join("sample_summary.json")),
  ]);
  if (!ppRes.ok) {
    throw new Error(`[canonical sample dashboard] sample_cards_pp.json HTTP ${ppRes.status}`);
  }
  if (!udRes.ok) {
    throw new Error(`[canonical sample dashboard] sample_cards_ud.json HTTP ${udRes.status}`);
  }
  if (!sumRes.ok) {
    throw new Error(`[canonical sample dashboard] sample_summary.json HTTP ${sumRes.status}`);
  }
  let pp: unknown;
  let ud: unknown;
  let summary: unknown;
  try {
    pp = await ppRes.json();
    ud = await udRes.json();
    summary = await sumRes.json();
  } catch (e) {
    throw new Error(`[canonical sample dashboard] JSON parse failed — ${(e as Error).message}`);
  }
  return parseCanonicalSampleArtifactsFromJson(pp, ud, summary);
}
