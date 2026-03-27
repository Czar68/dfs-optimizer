/**
 * Phase 20 — Canonical sample artifacts: contract + determinism + golden outputs.
 */
import fs from "fs";
import path from "path";
import {
  buildCanonicalSampleBundle,
  stringifyCanonicalSampleJson,
  stripVolatileSampleFieldsDeep,
  writeCanonicalSampleArtifacts,
} from "../src/reporting/canonical_sample_artifacts";

describe("Phase 20 canonical sample artifacts", () => {
  const cwd = process.cwd();

  it("buildCanonicalSampleBundle: PP + UD present; PP has multiple flex sizes; UD has structure metadata", () => {
    const { pp, ud, summary } = buildCanonicalSampleBundle({ cwd });
    expect(pp.platform).toBe("pp");
    expect(ud.platform).toBe("ud");
    expect(pp.cards.length).toBeGreaterThan(0);
    expect(ud.cards.length).toBeGreaterThan(0);
    expect(summary.pp.flexSizes.length).toBeGreaterThanOrEqual(1);
    expect(summary.ud.structureIds.length).toBeGreaterThan(0);
    expect(summary.sources.pp.relativePath).toContain("prizepicks-cards");
    expect(summary.sources.ud.relativePath).toContain("underdog_cards_source");
  });

  it("stringifyCanonicalSampleJson is identical on repeated calls (deterministic)", () => {
    const { pp, ud, summary } = buildCanonicalSampleBundle({ cwd });
    const a = stringifyCanonicalSampleJson(pp);
    const b = stringifyCanonicalSampleJson(pp);
    const c = stringifyCanonicalSampleJson(ud);
    const d = stringifyCanonicalSampleJson(ud);
    const e = stringifyCanonicalSampleJson(summary);
    const f = stringifyCanonicalSampleJson(summary);
    expect(a).toBe(b);
    expect(c).toBe(d);
    expect(e).toBe(f);
  });

  it("committed golden files under artifacts/samples match regenerated bundle", () => {
    const { pp, ud, summary } = buildCanonicalSampleBundle({ cwd });
    const dir = path.join(cwd, "artifacts", "samples");
    expect(fs.readFileSync(path.join(dir, "sample_cards_pp.json"), "utf8")).toBe(stringifyCanonicalSampleJson(pp));
    expect(fs.readFileSync(path.join(dir, "sample_cards_ud.json"), "utf8")).toBe(stringifyCanonicalSampleJson(ud));
    expect(fs.readFileSync(path.join(dir, "sample_summary.json"), "utf8")).toBe(stringifyCanonicalSampleJson(summary));
  });

  it("stripVolatileSampleFieldsDeep removes runTimestamp only (no numeric mutation)", () => {
    const input = {
      runTimestamp: "volatile",
      nested: { runTimestamp: "x", keep: 1 },
      arr: [{ runTimestamp: "y", z: 2 }],
    };
    const out = stripVolatileSampleFieldsDeep(input) as Record<string, unknown>;
    expect(out.runTimestamp).toBeUndefined();
    expect((out.nested as Record<string, unknown>).runTimestamp).toBeUndefined();
    expect((out.nested as Record<string, unknown>).keep).toBe(1);
    expect(((out.arr as unknown[])[0] as Record<string, unknown>).runTimestamp).toBeUndefined();
    expect(((out.arr as unknown[])[0] as Record<string, unknown>).z).toBe(2);
  });

  it("writeCanonicalSampleArtifacts produces identical bundle to read (idempotent)", () => {
    const before = buildCanonicalSampleBundle({ cwd });
    writeCanonicalSampleArtifacts({ cwd });
    const after = buildCanonicalSampleBundle({ cwd });
    expect(stringifyCanonicalSampleJson(before.pp)).toBe(stringifyCanonicalSampleJson(after.pp));
    expect(stringifyCanonicalSampleJson(before.ud)).toBe(stringifyCanonicalSampleJson(after.ud));
    expect(stringifyCanonicalSampleJson(before.summary)).toBe(stringifyCanonicalSampleJson(after.summary));
  });
});
