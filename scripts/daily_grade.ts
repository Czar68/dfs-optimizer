/**
 * scripts/daily_grade.ts
 * Run the auto-grader (Odds API Scores + ESPN box scores → grade legs),
 * then move fully-graded cards from pending_cards.json to history.json.
 *
 * Usage: npx ts-node scripts/daily_grade.ts
 *        npx ts-node scripts/daily_grade.ts
 */

import fs from "fs";
import path from "path";
import { runAutoGrader, loadPendingCards, savePendingCards } from "../src/tracking/auto_grader";
import { isCardFullyGraded } from "../src/tracking/analytics_engine";
import type { TrackedCard } from "../src/tracking/tracker_schema";

const ROOT = process.cwd();
const PENDING_PATH = path.join(ROOT, "data", "tracking", "pending_cards.json");
const HISTORY_PATH = path.join(ROOT, "data", "tracking", "history.json");

function readJsonFile(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("[DailyGrade] Starting auto-grader + archive ...");

  try {
    const { graded, totalLegs } = await runAutoGrader({ daysFrom: 1 });
    console.log(`[DailyGrade] Auto-grader done: ${graded}/${totalLegs} legs graded.`);

    const data = readJsonFile(PENDING_PATH) as { timestamp?: string; cards?: unknown[] } | null;
    const cards = (Array.isArray(data?.cards) ? data.cards : []) as TrackedCard[];
    const fullyGraded = cards.filter(isCardFullyGraded);
    const stillPending = cards.filter((c) => !isCardFullyGraded(c));

    if (fullyGraded.length === 0) {
      console.log("[DailyGrade] No fully-graded cards to archive.");
      return;
    }

    const dir = path.dirname(PENDING_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let historyCards: TrackedCard[] = [];
    if (fs.existsSync(HISTORY_PATH)) {
      const hist = readJsonFile(HISTORY_PATH) as { cards?: unknown[] } | null;
      historyCards = (Array.isArray(hist?.cards) ? hist.cards : []) as TrackedCard[];
    }
    historyCards = [...historyCards, ...fullyGraded];
    fs.writeFileSync(
      HISTORY_PATH,
      JSON.stringify({ timestamp: new Date().toISOString(), cards: historyCards }, null, 2),
      "utf8"
    );

    savePendingCards({
      timestamp: new Date().toISOString(),
      cards: stillPending,
    });

    console.log(`[DailyGrade] Archived ${fullyGraded.length} cards. ${stillPending.length} pending remaining.`);
  } catch (err) {
    console.error("[DailyGrade] Error:", err);
    process.exit(1);
  }
}

main();
