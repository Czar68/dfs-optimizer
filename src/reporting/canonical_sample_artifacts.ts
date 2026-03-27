/**
 * Phase 20 — Canonical sample artifacts (regression anchors / UI inputs / debugging).
 *
 * Contract: `CANONICAL_SAMPLE_SCHEMA_VERSION` + `PHASE20_SAMPLE_CONTRACT_ID`.
 * Inputs are real optimizer output shapes (PP: `prizepicks-cards.json` array; UD: `underdog-cards.json` envelope).
 *
 * Normalization is presentation-only: strip volatile keys (e.g. run envelope timestamps), sort object keys
 * lexicographically for stable diffs, optional redaction of absolute filesystem paths in strings.
 * Does not re-run EV, ranking, or selection.
 */

import fs from "fs";
import path from "path";

import { CANONICAL_SAMPLE_SCHEMA_VERSION, PHASE20_SAMPLE_CONTRACT_ID } from "./canonical_sample_contract";

export { CANONICAL_SAMPLE_SCHEMA_VERSION, PHASE20_SAMPLE_CONTRACT_ID } from "./canonical_sample_contract";

/** Keys removed everywhere in the tree (volatile run metadata, not leg schedule fields). */
export const VOLATILE_KEYS_STRIPPED = ["runTimestamp"] as const;

const ABS_PATH_WIN = /^[a-zA-Z]:\\/;

function looksLikeVolatileAbsolutePathString(s: string): boolean {
  if (ABS_PATH_WIN.test(s)) return true;
  if (s.startsWith("/Users/") || s.startsWith("/home/")) return true;
  return false;
}

export interface CanonicalSamplePaths {
  /** Directory containing sample_cards_pp.json, sample_cards_ud.json, sample_summary.json */
  samplesDir: string;
  sampleCardsPpPath: string;
  sampleCardsUdPath: string;
  sampleSummaryPath: string;
}

export function getCanonicalSampleArtifactPaths(cwd: string): CanonicalSamplePaths {
  const samplesDir = path.join(cwd, "artifacts", "samples");
  return {
    samplesDir,
    sampleCardsPpPath: path.join(samplesDir, "sample_cards_pp.json"),
    sampleCardsUdPath: path.join(samplesDir, "sample_cards_ud.json"),
    sampleSummaryPath: path.join(samplesDir, "sample_summary.json"),
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortKeysDeep(obj[k]);
  }
  return out;
}

/**
 * Strip volatile keys and redact obvious absolute paths in string leaves (machine-local).
 */
export function stripVolatileSampleFieldsDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      const s = value;
      if (looksLikeVolatileAbsolutePathString(s)) {
        return "<redacted_absolute_path>";
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripVolatileSampleFieldsDeep);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if ((VOLATILE_KEYS_STRIPPED as readonly string[]).includes(k)) {
      continue;
    }
    out[k] = stripVolatileSampleFieldsDeep(obj[k]);
  }
  return out;
}

/** Deterministic JSON (sorted keys, trailing newline). */
export function stringifyCanonicalSampleJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(stripVolatileSampleFieldsDeep(value)), null, 2)}\n`;
}

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

export interface BuildCanonicalSamplesOptions {
  cwd: string;
  /** Default: data/processed/prizepicks-cards.json */
  ppCardsRelativePath?: string;
  /** Default: data/samples/fixtures/underdog_cards_source.json */
  udCardsRelativePath?: string;
}

export interface CanonicalPpEnvelope {
  schemaVersion: typeof CANONICAL_SAMPLE_SCHEMA_VERSION;
  contract: typeof PHASE20_SAMPLE_CONTRACT_ID;
  platform: "pp";
  cards: unknown[];
}

export interface CanonicalUdEnvelope {
  schemaVersion: typeof CANONICAL_SAMPLE_SCHEMA_VERSION;
  contract: typeof PHASE20_SAMPLE_CONTRACT_ID;
  platform: "ud";
  cards: unknown[];
}

export interface CanonicalSampleSummary {
  schemaVersion: typeof CANONICAL_SAMPLE_SCHEMA_VERSION;
  contract: typeof PHASE20_SAMPLE_CONTRACT_ID;
  sources: {
    pp: { relativePath: string; cardCount: number };
    ud: { relativePath: string; cardCount: number };
  };
  pp: {
    cardCount: number;
    /** Distinct flex sizes present (e.g. 5 vs 6). */
    flexSizes: number[];
    modes: string[];
  };
  ud: {
    cardCount: number;
    structureIds: string[];
    flexTypes: string[];
  };
  normalization: {
    strippedKeys: readonly string[];
    keysSortedLexicographically: true;
    absolutePathsInStrings: "redacted_when_detected";
  };
}

function distinctSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

function collectUdMeta(cards: unknown[]): { structureIds: string[]; flexTypes: string[] } {
  const structureIds = new Set<string>();
  const flexTypes = new Set<string>();
  for (const c of cards) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      const sid = o.structureId;
      const ft = o.flexType;
      if (typeof sid === "string") structureIds.add(sid);
      if (typeof ft === "string") flexTypes.add(ft);
    }
  }
  return {
    structureIds: [...structureIds].sort((a, b) => a.localeCompare(b)),
    flexTypes: [...flexTypes].sort((a, b) => a.localeCompare(b)),
  };
}

function collectPpMeta(cards: unknown[]): { flexSizes: number[]; modes: string[] } {
  const sizes: number[] = [];
  const modes = new Set<string>();
  for (const c of cards) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      if (typeof o.size === "number") sizes.push(o.size);
      if (typeof o.mode === "string") modes.add(o.mode);
    }
  }
  return {
    flexSizes: distinctSorted(sizes),
    modes: [...modes].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Build PP/UD envelopes + summary from on-disk optimizer JSON outputs (paths relative to cwd).
 */
export function buildCanonicalSampleBundle(opts: BuildCanonicalSamplesOptions): {
  pp: CanonicalPpEnvelope;
  ud: CanonicalUdEnvelope;
  summary: CanonicalSampleSummary;
} {
  const cwd = opts.cwd;
  const ppRel = opts.ppCardsRelativePath ?? path.join("data", "processed", "prizepicks-cards.json");
  const udRel = opts.udCardsRelativePath ?? path.join("data", "samples", "fixtures", "underdog_cards_source.json");

  const ppPath = path.join(cwd, ppRel);
  const udPath = path.join(cwd, udRel);

  const ppRaw = readJsonFile(ppPath);
  if (!Array.isArray(ppRaw)) {
    throw new Error(`Phase 20: expected PP file to be a JSON array: ${ppRel}`);
  }

  const udRaw = readJsonFile(udPath);
  if (!udRaw || typeof udRaw !== "object" || Array.isArray(udRaw)) {
    throw new Error(`Phase 20: expected UD file to be a JSON object: ${udRel}`);
  }
  const udObj = udRaw as Record<string, unknown>;
  const udCards = udObj.cards;
  if (!Array.isArray(udCards)) {
    throw new Error(`Phase 20: expected UD.cards to be an array: ${udRel}`);
  }

  const ppEnvelope: CanonicalPpEnvelope = {
    schemaVersion: CANONICAL_SAMPLE_SCHEMA_VERSION,
    contract: PHASE20_SAMPLE_CONTRACT_ID,
    platform: "pp",
    cards: ppRaw,
  };

  const udEnvelope: CanonicalUdEnvelope = {
    schemaVersion: CANONICAL_SAMPLE_SCHEMA_VERSION,
    contract: PHASE20_SAMPLE_CONTRACT_ID,
    platform: "ud",
    cards: udCards,
  };

  const ppMeta = collectPpMeta(ppRaw);
  const udMeta = collectUdMeta(udCards);

  const summary: CanonicalSampleSummary = {
    schemaVersion: CANONICAL_SAMPLE_SCHEMA_VERSION,
    contract: PHASE20_SAMPLE_CONTRACT_ID,
    sources: {
      pp: { relativePath: ppRel.replace(/\\/g, "/"), cardCount: ppRaw.length },
      ud: { relativePath: udRel.replace(/\\/g, "/"), cardCount: udCards.length },
    },
    pp: {
      cardCount: ppRaw.length,
      flexSizes: ppMeta.flexSizes,
      modes: ppMeta.modes,
    },
    ud: {
      cardCount: udCards.length,
      structureIds: udMeta.structureIds,
      flexTypes: udMeta.flexTypes,
    },
    normalization: {
      strippedKeys: VOLATILE_KEYS_STRIPPED,
      keysSortedLexicographically: true,
      absolutePathsInStrings: "redacted_when_detected",
    },
  };

  return { pp: ppEnvelope, ud: udEnvelope, summary };
}

/** Result of comparing on-disk `artifacts/samples/*` to freshly generated canonical JSON (Phase 21 drift guard). */
export type CanonicalSampleDriftResult =
  | { ok: true }
  | {
      ok: false;
      /** Operator-facing explanation + remediation. */
      message: string;
      mismatches: Array<{ relativePath: string; reason: string }>;
    };

/**
 * Compare committed `artifacts/samples/*.json` to the deterministic output of {@link buildCanonicalSampleBundle}
 * (read-only — does not write or mutate files).
 */
export function verifyCanonicalSampleArtifactsDrift(opts: BuildCanonicalSamplesOptions): CanonicalSampleDriftResult {
  const { pp, ud, summary } = buildCanonicalSampleBundle(opts);
  const paths = getCanonicalSampleArtifactPaths(opts.cwd);
  const checks: Array<{ relativePath: string; expected: string; absolutePath: string }> = [
    {
      relativePath: path.relative(opts.cwd, paths.sampleCardsPpPath).replace(/\\/g, "/"),
      expected: stringifyCanonicalSampleJson(pp),
      absolutePath: paths.sampleCardsPpPath,
    },
    {
      relativePath: path.relative(opts.cwd, paths.sampleCardsUdPath).replace(/\\/g, "/"),
      expected: stringifyCanonicalSampleJson(ud),
      absolutePath: paths.sampleCardsUdPath,
    },
    {
      relativePath: path.relative(opts.cwd, paths.sampleSummaryPath).replace(/\\/g, "/"),
      expected: stringifyCanonicalSampleJson(summary),
      absolutePath: paths.sampleSummaryPath,
    },
  ];

  const mismatches: Array<{ relativePath: string; reason: string }> = [];
  for (const c of checks) {
    if (!fs.existsSync(c.absolutePath)) {
      mismatches.push({ relativePath: c.relativePath, reason: "file missing" });
      continue;
    }
    const onDisk = fs.readFileSync(c.absolutePath, "utf8");
    if (onDisk !== c.expected) {
      mismatches.push({
        relativePath: c.relativePath,
        reason: "content does not match generate output (run npm run generate:canonical-samples after intentional fixture changes)",
      });
    }
  }

  if (mismatches.length === 0) {
    return { ok: true };
  }

  const lines = [
    "Canonical sample artifact drift: committed artifacts/samples/*.json does not match buildCanonicalSampleBundle output.",
    "Remediation: update data/processed or data/samples/fixtures sources if intended, then run npm run generate:canonical-samples and commit artifacts/samples/.",
    "",
    "Mismatches:",
    ...mismatches.map((m) => `- ${m.relativePath}: ${m.reason}`),
  ];
  return { ok: false, message: lines.join("\n"), mismatches };
}

/**
 * Write canonical sample JSON files under artifacts/samples/ (deterministic).
 */
export function writeCanonicalSampleArtifacts(opts: BuildCanonicalSamplesOptions): CanonicalSamplePaths {
  const cwd = opts.cwd;
  const { pp, ud, summary } = buildCanonicalSampleBundle(opts);
  const paths = getCanonicalSampleArtifactPaths(cwd);
  if (!fs.existsSync(paths.samplesDir)) {
    fs.mkdirSync(paths.samplesDir, { recursive: true });
  }
  fs.writeFileSync(paths.sampleCardsPpPath, stringifyCanonicalSampleJson(pp), "utf8");
  fs.writeFileSync(paths.sampleCardsUdPath, stringifyCanonicalSampleJson(ud), "utf8");
  fs.writeFileSync(paths.sampleSummaryPath, stringifyCanonicalSampleJson(summary), "utf8");
  return paths;
}
