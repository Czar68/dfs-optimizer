/**
 * Phase 79 — Write data/reports/latest_card_ev_viability.json + .md from prizepicks-legs.json
 * Usage: npx ts-node scripts/export_card_ev_viability.ts [cwd]
 */

import {
  buildCardEvViabilityPayloadFromFile,
  writeCardEvViabilityArtifacts,
} from "../src/reporting/card_ev_viability";

async function main(): Promise<void> {
  const cwd = process.argv[2] ?? process.cwd();
  const payload = await buildCardEvViabilityPayloadFromFile({ cwd });
  writeCardEvViabilityArtifacts(cwd, payload);
  console.log(`[Phase79] Wrote data/reports/latest_card_ev_viability.json + .md (rootCause=${payload.rootCauseClassification})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
