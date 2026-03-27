/**
 * Phase 21 — Drift guard for committed artifacts/samples vs generator (no disk mutation in verify path).
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  verifyCanonicalSampleArtifactsDrift,
  writeCanonicalSampleArtifacts,
} from "../src/reporting/canonical_sample_artifacts";

describe("Phase 21 canonical sample drift guard", () => {
  const repoRoot = process.cwd();

  it("verifyCanonicalSampleArtifactsDrift passes when artifacts/samples are current", () => {
    const r = verifyCanonicalSampleArtifactsDrift({ cwd: repoRoot });
    expect(r.ok).toBe(true);
  });

  it("verifyCanonicalSampleArtifactsDrift is deterministic on repeated clean checks", () => {
    const a = verifyCanonicalSampleArtifactsDrift({ cwd: repoRoot });
    const b = verifyCanonicalSampleArtifactsDrift({ cwd: repoRoot });
    expect(a).toEqual(b);
  });

  it("fails with explicit remediation when a committed sample file is perturbed (isolated temp tree)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dfs-phase21-drift-"));
    try {
      fs.mkdirSync(path.join(tmp, "data", "processed"), { recursive: true });
      fs.mkdirSync(path.join(tmp, "data", "samples", "fixtures"), { recursive: true });
      fs.mkdirSync(path.join(tmp, "artifacts", "samples"), { recursive: true });
      fs.copyFileSync(
        path.join(repoRoot, "data", "processed", "prizepicks-cards.json"),
        path.join(tmp, "data", "processed", "prizepicks-cards.json")
      );
      fs.copyFileSync(
        path.join(repoRoot, "data", "samples", "fixtures", "underdog_cards_source.json"),
        path.join(tmp, "data", "samples", "fixtures", "underdog_cards_source.json")
      );
      writeCanonicalSampleArtifacts({ cwd: tmp });
      const summaryPath = path.join(tmp, "artifacts", "samples", "sample_summary.json");
      const bad = fs.readFileSync(summaryPath, "utf8").replace('"schemaVersion": 1', '"schemaVersion": 99999');
      fs.writeFileSync(summaryPath, bad, "utf8");

      const r = verifyCanonicalSampleArtifactsDrift({ cwd: tmp });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toContain("Remediation:");
        expect(r.message).toContain("generate:canonical-samples");
        expect(r.mismatches.some((m) => m.relativePath.includes("sample_summary.json"))).toBe(true);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("verify path does not modify committed artifacts/samples (mtime stable)", () => {
    const p = path.join(repoRoot, "artifacts", "samples", "sample_summary.json");
    const before = fs.statSync(p).mtimeMs;
    const r = verifyCanonicalSampleArtifactsDrift({ cwd: repoRoot });
    expect(r.ok).toBe(true);
    const after = fs.statSync(p).mtimeMs;
    expect(after).toBe(before);
  });
});
