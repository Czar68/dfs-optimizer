// src/test_fantasy.ts
import { runFantasyAnalyzer } from "./fantasy_analyzer";

async function main() {
  const rows = await runFantasyAnalyzer();
  console.log("Total fantasy rows:", rows.length);
  console.log("Top 25 by |diff|:");
  console.table(
    rows.slice(0, 25).map((r) => ({
      league: r.league,
      player: r.player,
      fantasyLine: r.fantasyLine,
      impliedFantasy: Number(r.impliedFantasy.toFixed(2)),
      diff: Number(r.diff.toFixed(2)),
    }))
  );
}

main().catch((err) => {
  console.error("test_fantasy error:", err);
  process.exit(1);
});
