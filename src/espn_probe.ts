// src/espn_probe.ts
// Spot-check ESPN historical reach: scoreboard events count + one summary boxscore shape.

import { getScoreboardGameIds, getBoxScoreForGame } from "./espn_boxscore";

async function probeDate(date: string): Promise<{ events: number; summaryOk: boolean; boxscoreShapeOk: boolean; notes: string }> {
  const events = await getScoreboardGameIds(date);
  let summaryOk = false;
  let boxscoreShapeOk = false;
  let notes = "";
  if (events.length === 0) {
    notes = "no events";
    return { events: 0, summaryOk: false, boxscoreShapeOk: false, notes };
  }
  try {
    const box = await getBoxScoreForGame(events[0]!);
    summaryOk = true;
    boxscoreShapeOk = box.size > 0;
    if (box.size > 0) {
      const first = [...box.entries()][0]!;
      const hasStats = [first[1].points, first[1].rebounds, first[1].assists].some((v) => typeof v === "number");
      if (!hasStats) notes = "athletes but no stat values";
      else notes = `${box.size} players`;
    } else notes = "empty boxscore";
  } catch (e) {
    notes = (e as Error).message?.slice(0, 40) ?? "error";
  }
  return { events: events.length, summaryOk, boxscoreShapeOk, notes };
}

async function main(): Promise<void> {
  const dates = ["2026-02-22", "2025-02-15", "2024-02-15"];
  console.log("date       | events | summary ok? | boxscore shape ok? | notes");
  console.log("-----------|--------|-------------|---------------------|--------");
  for (const date of dates) {
    const r = await probeDate(date);
    const sumOk = r.summaryOk ? "yes" : "no";
    const boxOk = r.boxscoreShapeOk ? "yes" : "no";
    console.log(`${date} | ${String(r.events).padStart(6)} | ${sumOk.padEnd(11)} | ${boxOk.padEnd(19)} | ${r.notes}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
