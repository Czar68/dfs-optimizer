/**
 * Phase 27 — Deterministic operator-facing copy for canonical samples load/validation failures (dashboard panel).
 * Maps raw Error.message strings into a stable headline + optional single-line detail. No logging.
 * Phase 28 — Stable repo-relative runbook pointer (error panel only).
 */

/** Repo-relative path + anchor; matches `## Troubleshooting` in `docs/CANONICAL_SAMPLES_DASHBOARD.md`. */
export const CANONICAL_SAMPLES_DASHBOARD_RUNBOOK_POINTER =
  "docs/CANONICAL_SAMPLES_DASHBOARD.md#troubleshooting";

export type CanonicalSamplesPanelFailureCopy = {
  headline: string;
  detail: string | null;
};

const MAX_FALLBACK_DETAIL = 120;

/**
 * Normalize a thrown/failed fetch/parse/validation message into short UI strings.
 * Avoids multi-line dumps and passes through only a capped fallback line when unclassified.
 */
export function normalizeCanonicalSamplesPanelError(rawMessage: string): CanonicalSamplesPanelFailureCopy {
  const s = rawMessage.replace(/\s+/g, " ").trim();
  if (!s) {
    return { headline: "Failed to load canonical samples", detail: null };
  }

  const httpMatch = s.match(/HTTP\s+(\d+)/i);
  if (httpMatch) {
    const code = httpMatch[1];
    if (code === "404") {
      return {
        headline: "Canonical samples unavailable",
        detail: "Missing canonical bundle",
      };
    }
    return {
      headline: "Failed to load canonical samples",
      detail: `Request failed (HTTP ${code})`,
    };
  }

  if (s.toLowerCase().includes("json parse failed")) {
    return {
      headline: "Invalid canonical samples response",
      detail: "Malformed JSON",
    };
  }

  if (/canonical sample consumer/i.test(s)) {
    const body = s.replace(/^\[canonical sample consumer\]\s*/i, "").trim();
    const bl = body.toLowerCase();
    if (bl.includes("schemaversion")) {
      return { headline: "Canonical samples validation failed", detail: "Schema version mismatch" };
    }
    if (bl.includes("contract mismatch")) {
      return { headline: "Canonical samples validation failed", detail: "Contract mismatch" };
    }
    if (bl.includes("must be a json object") || bl.includes("must be an array") || bl.includes("platform must")) {
      return { headline: "Canonical samples validation failed", detail: "Invalid bundle shape" };
    }
    if (bl.includes("missing sources") || bl.includes("normalization")) {
      return { headline: "Canonical samples validation failed", detail: "Invalid bundle shape" };
    }
    return { headline: "Canonical samples validation failed", detail: "Bundle validation failed" };
  }

  const stripped = s.replace(/^\[canonical sample dashboard\]\s*/i, "").trim();
  const truncated =
    stripped.length > MAX_FALLBACK_DETAIL ? `${stripped.slice(0, MAX_FALLBACK_DETAIL - 1)}…` : stripped;
  return {
    headline: "Failed to load canonical samples",
    detail: truncated || null,
  };
}
