/**
 * Phase 20 — Write artifacts/samples/{sample_cards_pp.json,sample_cards_ud.json,sample_summary.json}
 * from committed pipeline-style fixtures (default paths). No optimizer math execution.
 */
import path from "path";
import { writeCanonicalSampleArtifacts } from "../src/reporting/canonical_sample_artifacts";

const cwd = process.cwd();

function main(): void {
  const ppArg = process.argv.find((a) => a.startsWith("--pp="));
  const udArg = process.argv.find((a) => a.startsWith("--ud="));
  const ppCardsRelativePath = ppArg ? ppArg.slice("--pp=".length) : undefined;
  const udCardsRelativePath = udArg ? udArg.slice("--ud=".length) : undefined;

  const out = writeCanonicalSampleArtifacts({
    cwd,
    ppCardsRelativePath,
    udCardsRelativePath,
  });
  console.log(
    `Wrote canonical samples:\n  ${path.relative(cwd, out.sampleCardsPpPath)}\n  ${path.relative(cwd, out.sampleCardsUdPath)}\n  ${path.relative(cwd, out.sampleSummaryPath)}`
  );
}

main();
