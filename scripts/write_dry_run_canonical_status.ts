import { finalizeCanonicalRunStatus } from "../src/reporting/run_finalization";

export interface DryRunCanonicalStatusInput {
  rootDir: string;
  runTimestamp: string | null;
}

export function writeDryRunCanonicalStatus(input: DryRunCanonicalStatusInput): void {
  finalizeCanonicalRunStatus({
    rootDir: input.rootDir,
    generatedAtUtc: new Date().toISOString(),
    runTimestamp: input.runTimestamp,
    success: true,
    outcome: "full_success",
    runHealth: "degraded_success",
    ppCards: [],
    ppPicksCount: 0,
    udCards: [],
    udPicksCount: 0,
    digest: { generated: false, shownCount: null, dedupedCount: null },
    notes: [
      "Dry-run mode: optimizer fetch/merge/build execution was intentionally skipped.",
      "Telegram high-EV digest is not persisted as a file (chat-only).",
    ],
    degradationReasons: ["dry_run_no_live_execution"],
    expectedArtifacts: {},
  });
}

function parseRunTimestampArg(argv: string[]): string | null {
  for (const a of argv) {
    if (a.startsWith("--runTimestamp=")) {
      const v = a.slice("--runTimestamp=".length).trim();
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

if (require.main === module) {
  writeDryRunCanonicalStatus({
    rootDir: process.cwd(),
    runTimestamp: parseRunTimestampArg(process.argv.slice(2)),
  });
  console.log("[RunStatus] Dry-run canonical status emitted.");
}
