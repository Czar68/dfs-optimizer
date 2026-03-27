import { useEffect, useState } from "react";
import { fetchCanonicalSampleArtifactsForDashboard } from "../lib/canonicalSamples";
import {
  CANONICAL_SAMPLES_DASHBOARD_RUNBOOK_POINTER,
  normalizeCanonicalSamplesPanelError,
} from "../../../src/reporting/canonical_sample_artifacts_error_ui";
import { formatCanonicalSamplesPanelLines } from "../../../src/reporting/canonical_sample_artifacts_ui";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "ok"; lines: string[] }
  | { status: "error"; message: string };

/**
 * Phase 23 — Minimal read-only surface: loads canonical JSON via Phase 22 fetch path, shows compact artifact summary.
 * Phase 27 — Failures use normalized headline + optional detail (no raw stack / pre dump). No mock fallback on failure.
 * Phase 28 — Error state includes a stable runbook pointer (secondary to headline/detail).
 * Phase 29 — `fetchBaseUrl` from parent (normal base or `canonicalSamplesFixture=missing` test base).
 */
export type CanonicalSamplesPanelProps = {
  fetchBaseUrl: string;
};

export default function CanonicalSamplesPanel({ fetchBaseUrl }: CanonicalSamplesPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchCanonicalSampleArtifactsForDashboard(fetchBaseUrl)
      .then((bundle) => {
        if (cancelled) return;
        const lines = formatCanonicalSamplesPanelLines(bundle.pp, bundle.ud, bundle.summary);
        setState({ status: "ok", lines });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchBaseUrl]);

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-400">
        Loading canonical samples from <code className="text-gray-300">{fetchBaseUrl}</code>…
      </div>
    );
  }

  if (state.status === "error") {
    const { headline, detail } = normalizeCanonicalSamplesPanelError(state.message);
    return (
      <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-sm text-red-200 space-y-2">
        <div className="font-semibold text-red-300" data-testid="canonical-samples-error-headline">
          {headline}
        </div>
        {detail ? (
          <div className="text-sm text-red-200/95" data-testid="canonical-samples-error-detail">
            {detail}
          </div>
        ) : null}
        <p className="text-xs text-red-300/60" data-testid="canonical-samples-error-runbook">
          See canonical samples dashboard runbook:{" "}
          <code className="text-red-300/75">{CANONICAL_SAMPLES_DASHBOARD_RUNBOOK_POINTER}</code>
        </p>
        <div className="text-xs text-red-300/80">
          Ensure <code>npm run sync:canonical-samples-dashboard</code> has been run and static files exist under{" "}
          <code>public/data/canonical_samples/</code>.
        </div>
      </div>
    );
  }

  if (state.status === "ok") {
    return (
      <div className="p-4 bg-gray-900 border border-emerald-900/50 rounded-lg text-sm space-y-2">
        <div className="text-emerald-400 font-semibold">Canonical sample bundle (read-only)</div>
        <p className="text-xs text-gray-500">
          Source: same JSON as repo <code className="text-gray-400">artifacts/samples/</code>, synced for static hosting.
        </p>
        <ul className="font-mono text-xs text-gray-200 space-y-1 list-disc list-inside">
          {state.lines.map((line, i) => (
            <li key={i} className="break-all">
              {line}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}
