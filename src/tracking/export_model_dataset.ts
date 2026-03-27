/**
 * Phase 16N: export model-ready JSONL (perf tracker + optional dashboard tracker cards).
 * Usage: npx ts-node src/tracking/export_model_dataset.ts [--out path]
 */

import fs from "fs";
import path from "path";
import { parseTrackerLine, PERF_TRACKER_PATH } from "../perf_tracker_types";
import type { TrackedCard, TrackedLeg } from "./tracker_schema";

const ROOT = process.cwd();

function readJsonCards(filePath: string): TrackedCard[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as { cards?: unknown };
    return Array.isArray(data?.cards) ? (data.cards as TrackedCard[]) : [];
  } catch {
    return [];
  }
}

function legToExportRow(
  card: TrackedCard,
  leg: TrackedLeg,
  source: string
): Record<string, unknown> {
  return {
    source,
    cardId: card.cardId,
    platform: card.platform,
    structureId: card.structureId,
    flexType: card.flexType,
    cardTimestamp: card.timestamp,
    kellyStakeUsd: card.kellyStakeUsd,
    leg,
    playerId: leg.playerId,
    marketId: leg.marketId,
    openOddsAmerican: leg.openOddsAmerican,
    openImpliedProb: leg.openImpliedProb,
    openProbModel: leg.openProbModel ?? leg.projectedProb,
    rawProbModel: leg.rawProbModel,
    calibratedProbModel: leg.calibratedProbModel,
    probCalibrationApplied: leg.probCalibrationApplied,
    probCalibrationBucket: leg.probCalibrationBucket,
    closeOddsAmerican: leg.closeOddsAmerican,
    closeImpliedProb: leg.closeImpliedProb,
    clvDelta: leg.clvDelta,
    clvPct: leg.clvPct,
    result: leg.result,
    selectionSnapshot: leg.selectionSnapshot,
    gameStartTime: leg.gameStartTime,
    team: leg.team,
    opponent: leg.opponent,
  };
}

export function exportModelDataset(options?: { outPath?: string; includeTrackerJson?: boolean }): string {
  const outPath = options?.outPath ?? path.join(ROOT, "artifacts", "model_dataset.jsonl");
  const includeTracker = options?.includeTrackerJson ?? true;
  const lines: string[] = [];

  const perfPath = path.join(ROOT, PERF_TRACKER_PATH);
  if (fs.existsSync(perfPath)) {
    const raw = fs.readFileSync(perfPath, "utf8");
    for (const line of raw.split("\n")) {
      const row = parseTrackerLine(line);
      if (row) lines.push(JSON.stringify({ source: "perf_tracker.jsonl", row }));
    }
  }

  if (includeTracker) {
    const pending = path.join(ROOT, "data", "tracking", "pending_cards.json");
    const history = path.join(ROOT, "data", "tracking", "history.json");
    for (const p of [pending, history]) {
      const cards = readJsonCards(p);
      const tag = p.includes("pending") ? "pending_cards" : "history_cards";
      for (const card of cards) {
        for (const leg of card.legs || []) {
          lines.push(JSON.stringify(legToExportRow(card, leg, tag)));
        }
      }
    }
  }

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  return outPath;
}

function main(): void {
  const args = process.argv.slice(2);
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      out = args[++i];
    }
  }
  const p = exportModelDataset({ outPath: out });
  console.log(`[export:model-data] Wrote ${p}`);
}

if (require.main === module) {
  main();
}
