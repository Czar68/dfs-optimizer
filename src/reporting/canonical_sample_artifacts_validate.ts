/**
 * Phase 22 — Shared validation for committed canonical sample JSON (no fs; safe for dashboard bundling).
 */
import type { CanonicalPpEnvelope, CanonicalSampleSummary, CanonicalUdEnvelope } from "./canonical_sample_artifacts";
import { CANONICAL_SAMPLE_SCHEMA_VERSION, PHASE20_SAMPLE_CONTRACT_ID } from "./canonical_sample_contract";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export class CanonicalSampleArtifactValidationError extends Error {
  constructor(message: string) {
    super(`[canonical sample consumer] ${message}`);
    this.name = "CanonicalSampleArtifactValidationError";
  }
}

function assertPp(v: unknown): CanonicalPpEnvelope {
  if (!isPlainObject(v)) throw new CanonicalSampleArtifactValidationError("PP envelope must be a JSON object");
  if (v.schemaVersion !== CANONICAL_SAMPLE_SCHEMA_VERSION) {
    throw new CanonicalSampleArtifactValidationError(
      `PP schemaVersion expected ${CANONICAL_SAMPLE_SCHEMA_VERSION}, got ${String(v.schemaVersion)}`
    );
  }
  if (v.contract !== PHASE20_SAMPLE_CONTRACT_ID) {
    throw new CanonicalSampleArtifactValidationError(`PP contract mismatch`);
  }
  if (v.platform !== "pp") {
    throw new CanonicalSampleArtifactValidationError(`PP platform must be "pp"`);
  }
  if (!Array.isArray(v.cards)) {
    throw new CanonicalSampleArtifactValidationError("PP cards must be an array");
  }
  return v as unknown as CanonicalPpEnvelope;
}

function assertUd(v: unknown): CanonicalUdEnvelope {
  if (!isPlainObject(v)) throw new CanonicalSampleArtifactValidationError("UD envelope must be a JSON object");
  if (v.schemaVersion !== CANONICAL_SAMPLE_SCHEMA_VERSION) {
    throw new CanonicalSampleArtifactValidationError(
      `UD schemaVersion expected ${CANONICAL_SAMPLE_SCHEMA_VERSION}, got ${String(v.schemaVersion)}`
    );
  }
  if (v.contract !== PHASE20_SAMPLE_CONTRACT_ID) {
    throw new CanonicalSampleArtifactValidationError(`UD contract mismatch`);
  }
  if (v.platform !== "ud") {
    throw new CanonicalSampleArtifactValidationError(`UD platform must be "ud"`);
  }
  if (!Array.isArray(v.cards)) {
    throw new CanonicalSampleArtifactValidationError("UD cards must be an array");
  }
  return v as unknown as CanonicalUdEnvelope;
}

function assertSummary(v: unknown): CanonicalSampleSummary {
  if (!isPlainObject(v)) throw new CanonicalSampleArtifactValidationError("summary must be a JSON object");
  if (v.schemaVersion !== CANONICAL_SAMPLE_SCHEMA_VERSION) {
    throw new CanonicalSampleArtifactValidationError(
      `summary schemaVersion expected ${CANONICAL_SAMPLE_SCHEMA_VERSION}, got ${String(v.schemaVersion)}`
    );
  }
  if (v.contract !== PHASE20_SAMPLE_CONTRACT_ID) {
    throw new CanonicalSampleArtifactValidationError(`summary contract mismatch`);
  }
  if (!isPlainObject(v.sources) || !isPlainObject(v.pp) || !isPlainObject(v.ud) || !isPlainObject(v.normalization)) {
    throw new CanonicalSampleArtifactValidationError("summary missing sources, pp, ud, or normalization");
  }
  return v as unknown as CanonicalSampleSummary;
}

/**
 * Validate parsed JSON from the three Phase 20 artifact files. Does not mutate inputs.
 */
export function parseCanonicalSampleArtifactsFromJson(
  ppJson: unknown,
  udJson: unknown,
  summaryJson: unknown
): {
  pp: CanonicalPpEnvelope;
  ud: CanonicalUdEnvelope;
  summary: CanonicalSampleSummary;
} {
  return {
    pp: assertPp(ppJson),
    ud: assertUd(udJson),
    summary: assertSummary(summaryJson),
  };
}
