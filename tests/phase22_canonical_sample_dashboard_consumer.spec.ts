/**
 * Phase 22 — Read-only consumer + dashboard sync (no optimizer changes).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import {
  CanonicalSampleArtifactValidationError,
  loadCanonicalSampleArtifactsReadOnly,
  parseCanonicalSampleArtifactsFromJson,
} from "../src/reporting/canonical_sample_artifacts_consumer";
import { PHASE20_SAMPLE_CONTRACT_ID } from "../src/reporting/canonical_sample_contract";

describe("Phase 22 canonical sample dashboard consumer", () => {
  const repoRoot = process.cwd();

  it("loadCanonicalSampleArtifactsReadOnly reads committed artifacts with expected PP/UD/summary shape", () => {
    const bundle = loadCanonicalSampleArtifactsReadOnly(repoRoot);
    expect(bundle.pp.platform).toBe("pp");
    expect(bundle.ud.platform).toBe("ud");
    expect(bundle.pp.contract).toBe(PHASE20_SAMPLE_CONTRACT_ID);
    expect(bundle.summary.contract).toBe(PHASE20_SAMPLE_CONTRACT_ID);
    expect(bundle.pp.cards.length).toBeGreaterThan(0);
    expect(bundle.ud.cards.length).toBeGreaterThan(0);
  });

  it("parseCanonicalSampleArtifactsFromJson fails clearly on wrong platform", () => {
    const pp = { schemaVersion: 1, contract: PHASE20_SAMPLE_CONTRACT_ID, platform: "ud", cards: [] };
    const ud = { schemaVersion: 1, contract: PHASE20_SAMPLE_CONTRACT_ID, platform: "ud", cards: [] };
    const summary = loadCanonicalSampleArtifactsReadOnly(repoRoot).summary;
    expect(() => parseCanonicalSampleArtifactsFromJson(pp, ud, summary)).toThrow(CanonicalSampleArtifactValidationError);
  });

  it("loadCanonicalSampleArtifactsReadOnly fails on missing file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dfs-phase22-"));
    try {
      fs.mkdirSync(path.join(tmp, "artifacts", "samples"), { recursive: true });
      expect(() => loadCanonicalSampleArtifactsReadOnly(tmp)).toThrow(/missing file/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("consumer read-only path does not modify artifacts/samples mtime", () => {
    const p = path.join(repoRoot, "artifacts", "samples", "sample_summary.json");
    const before = fs.statSync(p).mtimeMs;
    loadCanonicalSampleArtifactsReadOnly(repoRoot);
    expect(fs.statSync(p).mtimeMs).toBe(before);
  });

  it("sync script copies bytes matching artifacts/samples (deterministic)", () => {
    const pubDir = path.join(repoRoot, "web-dashboard", "public", "data", "canonical_samples");
    for (const name of ["sample_cards_pp.json", "sample_cards_ud.json", "sample_summary.json"]) {
      const a = fs.readFileSync(path.join(repoRoot, "artifacts", "samples", name), "utf8");
      const b = fs.readFileSync(path.join(pubDir, name), "utf8");
      expect(a).toBe(b);
    }
  });

  it("npm run sync:canonical-samples-dashboard is idempotent", () => {
    execSync("npm run sync:canonical-samples-dashboard", { cwd: repoRoot, stdio: "pipe" });
    execSync("npm run sync:canonical-samples-dashboard", { cwd: repoRoot, stdio: "pipe" });
    const pub = path.join(repoRoot, "web-dashboard", "public", "data", "canonical_samples", "sample_summary.json");
    const art = path.join(repoRoot, "artifacts", "samples", "sample_summary.json");
    expect(fs.readFileSync(pub, "utf8")).toBe(fs.readFileSync(art, "utf8"));
  });
});
