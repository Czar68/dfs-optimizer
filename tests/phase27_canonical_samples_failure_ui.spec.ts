/**
 * Phase 27 — Deterministic failure copy for canonical samples panel (normalizeCanonicalSamplesPanelError).
 */
import { normalizeCanonicalSamplesPanelError } from "../src/reporting/canonical_sample_artifacts_error_ui";

describe("Phase 27 canonical samples failure UI copy", () => {
  it("maps HTTP 404 to unavailable + missing bundle", () => {
    const r = normalizeCanonicalSamplesPanelError(
      "[canonical sample dashboard] sample_cards_pp.json HTTP 404"
    );
    expect(r.headline).toBe("Canonical samples unavailable");
    expect(r.detail).toBe("Missing canonical bundle");
  });

  it("maps non-404 HTTP to failed load + request failed detail", () => {
    const r = normalizeCanonicalSamplesPanelError(
      "[canonical sample dashboard] sample_summary.json HTTP 503"
    );
    expect(r.headline).toBe("Failed to load canonical samples");
    expect(r.detail).toBe("Request failed (HTTP 503)");
  });

  it("maps JSON parse failure to invalid response + malformed JSON", () => {
    const r = normalizeCanonicalSamplesPanelError(
      "[canonical sample dashboard] JSON parse failed — Unexpected token <"
    );
    expect(r.headline).toBe("Invalid canonical samples response");
    expect(r.detail).toBe("Malformed JSON");
  });

  it("maps consumer schema errors to validation failed + schema version mismatch", () => {
    const r = normalizeCanonicalSamplesPanelError(
      "[canonical sample consumer] PP schemaVersion expected 1, got undefined"
    );
    expect(r.headline).toBe("Canonical samples validation failed");
    expect(r.detail).toBe("Schema version mismatch");
  });

  it("maps consumer contract mismatch", () => {
    const r = normalizeCanonicalSamplesPanelError("[canonical sample consumer] PP contract mismatch");
    expect(r.headline).toBe("Canonical samples validation failed");
    expect(r.detail).toBe("Contract mismatch");
  });

  it("maps generic consumer validation to bundle validation failed", () => {
    const r = normalizeCanonicalSamplesPanelError(
      "[canonical sample consumer] PP envelope must be a JSON object"
    );
    expect(r.headline).toBe("Canonical samples validation failed");
    expect(r.detail).toBe("Invalid bundle shape");
  });

  it("caps unknown messages to a single line", () => {
    const long = "x".repeat(200);
    const r = normalizeCanonicalSamplesPanelError(`[canonical sample dashboard] ${long}`);
    expect(r.headline).toBe("Failed to load canonical samples");
    expect(r.detail).toBeDefined();
    expect(r.detail!.length).toBeLessThanOrEqual(120);
    expect(r.detail!.endsWith("…")).toBe(true);
  });

  it("success-path panel copy is not used as an error headline", () => {
    const r = normalizeCanonicalSamplesPanelError("[canonical sample consumer] PP contract mismatch");
    expect(r.headline).not.toContain("read-only");
    expect(r.headline).not.toMatch(/Canonical sample bundle/i);
  });
});
