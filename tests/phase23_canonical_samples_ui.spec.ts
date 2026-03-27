/**
 * Phase 23 — Pure UI summary lines + consumer contract (no React test harness in repo).
 */
import fs from "fs";
import path from "path";
import { formatCanonicalSamplesPanelLines } from "../src/reporting/canonical_sample_artifacts_ui";
import { loadCanonicalSampleArtifactsReadOnly } from "../src/reporting/canonical_sample_artifacts_consumer";
import { parseCanonicalSampleArtifactsFromJson } from "../src/reporting/canonical_sample_artifacts_validate";

describe("Phase 23 canonical samples UI surface (format + data)", () => {
  const repoRoot = process.cwd();

  it("formatCanonicalSamplesPanelLines lists contract, counts, modes, structureIds, and stable first-leg ids", () => {
    const bundle = loadCanonicalSampleArtifactsReadOnly(repoRoot);
    const lines = formatCanonicalSamplesPanelLines(bundle.pp, bundle.ud, bundle.summary);
    expect(lines.join("\n")).toContain("phase20_canonical_sample_v1");
    expect(lines.some((l) => l.includes("PP: 3 cards"))).toBe(true);
    expect(lines.some((l) => l.includes("UD: 1 cards"))).toBe(true);
    expect(lines.some((l) => l.includes("UD_8F_FLX"))).toBe(true);
    expect(lines.some((l) => l.includes("stub-1"))).toBe(true);
    expect(lines.some((l) => l.includes("underdog-b97af3e6"))).toBe(true);
  });

  it("validation failure messages do not suggest mock fallback", () => {
    expect(() => parseCanonicalSampleArtifactsFromJson({}, {}, {})).toThrow(/canonical sample consumer/);
    try {
      parseCanonicalSampleArtifactsFromJson({}, {}, {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg.toLowerCase()).not.toContain("mock");
    }
  });

  it("read-only load does not modify artifacts/samples files", () => {
    const p = path.join(repoRoot, "artifacts", "samples", "sample_cards_pp.json");
    const before = fs.statSync(p).mtimeMs;
    loadCanonicalSampleArtifactsReadOnly(repoRoot);
    expect(fs.statSync(p).mtimeMs).toBe(before);
  });
});
