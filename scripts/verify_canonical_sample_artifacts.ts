/**
 * Phase 21 — Fail if artifacts/samples/*.json drifts from generate:canonical-samples output (read-only compare).
 */
import { verifyCanonicalSampleArtifactsDrift } from "../src/reporting/canonical_sample_artifacts";

const cwd = process.cwd();

function main(): void {
  const ppArg = process.argv.find((a) => a.startsWith("--pp="));
  const udArg = process.argv.find((a) => a.startsWith("--ud="));
  const result = verifyCanonicalSampleArtifactsDrift({
    cwd,
    ppCardsRelativePath: ppArg ? ppArg.slice("--pp=".length) : undefined,
    udCardsRelativePath: udArg ? udArg.slice("--ud=".length) : undefined,
  });

  if (!result.ok) {
    console.error("[verify:canonical-samples] FAILED\n");
    console.error(result.message);
    process.exit(1);
  }
  console.log("[verify:canonical-samples] OK — artifacts/samples match generated canonical bundle.");
  process.exit(0);
}

main();
