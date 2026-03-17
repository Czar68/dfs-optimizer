/**
 * Copy pipeline and artifact data into web-dashboard/public/data/ so that
 * the next vite build includes fresh data in dist/data/.
 * Never throws on missing file — logs and continues.
 * Usage: run from project root before npm run web:build (e.g. via npm run web:deploy).
 */

import path from "path";
import fs from "fs";

const ROOT = path.join(__dirname, "..");
const PUBLIC_DATA = path.join(ROOT, "web-dashboard", "public", "data");

const COPY_LIST: { src: string; name: string }[] = [
  { src: path.join(ROOT, "artifacts", "last_run.json"), name: "last_run.json" },
  { src: path.join(ROOT, "artifacts", "match_rate_history.csv"), name: "match_rate_history.csv" },
  { src: path.join(ROOT, "artifacts", "automation-card-matrix.json"), name: "automation-card-matrix.json" },
  { src: path.join(ROOT, "artifacts", "automation-card-matrix-audit.json"), name: "automation-card-matrix-audit.json" },
  { src: path.join(ROOT, "artifacts", "post-results-model-refresh.json"), name: "post-results-model-refresh.json" },
  { src: path.join(ROOT, "artifacts", "prop-warehouse-audit.json"), name: "prop-warehouse-audit.json" },
  { src: path.join(ROOT, "data", "output_logs", "automation-card-matrix.csv"), name: "automation-card-matrix.csv" },
  { src: path.join(ROOT, "data", "output_logs", "merge_report_prizepicks.csv"), name: "merge_report_prizepicks.csv" },
  { src: path.join(ROOT, "data", "output_logs", "merge_report_underdog.csv"), name: "merge_report_underdog.csv" },
  { src: path.join(ROOT, "data", "output_logs", "prizepicks-legs.csv"), name: "prizepicks-legs.csv" },
  { src: path.join(ROOT, "data", "output_logs", "underdog-legs.csv"), name: "underdog-legs.csv" },
  { src: path.join(ROOT, "data", "output_logs", "prizepicks-cards.csv"), name: "prizepicks-cards.csv" },
  { src: path.join(ROOT, "data", "output_logs", "underdog-cards.csv"), name: "underdog-cards.csv" },
  { src: path.join(ROOT, "data", "output_logs", "tier1.csv"), name: "tier1.csv" },
  { src: path.join(ROOT, "data", "output_logs", "tier2.csv"), name: "tier2.csv" },
  { src: path.join(ROOT, "data", "output_logs", "line_movement.csv"), name: "line_movement.csv" },
  { src: path.join(ROOT, "data", "output_logs", "espn_status.csv"), name: "espn_status.csv" },
];

/** Header-only placeholders so dashboard gets 200 instead of 404 for optional CSVs. */
const OPTIONAL_CSV_PLACEHOLDERS: Record<string, string> = {
  "line_movement.csv": "leg_id,player,stat,delta,category,priorLine,currentLine,priorRunTs",
  "espn_status.csv": "leg_id,player,espnStatus,espnMinutes",
  "merge_report_prizepicks.csv": "site,player,stat,line,sport,matched,reason,bestOddsLine,bestOddsPlayerNorm,matchType,altDelta",
  "merge_report_underdog.csv": "site,player,stat,line,sport,matched,reason,bestOddsLine,bestOddsPlayerNorm,matchType,altDelta",
  "automation-card-matrix.csv":
    "platform,flexType,structureId,legs,stake,EV,EV$,winProb,payoutVar,breakeven%,breakevenOdds,selectedForWager,kellyStake,promoMultiplier,promoNotes",
};

/** Optional JSON artifacts: write minimal placeholder when source missing (e.g. copy run without prior export). */
const OPTIONAL_JSON_PLACEHOLDERS: Record<string, string> = {
  "automation-card-matrix.json": '{"generatedAt":null,"totalStructures":0,"rows":[]}',
  "automation-card-matrix-audit.json":
    '{"generatedAt":null,"totalCanonicalStructures":0,"exportedRowCount":0,"selectedForWagerCount":0,"missingMonteCarloStructures":[],"missingBreakevenStructures":[],"selectedForWagerRule":""}',
  "post-results-model-refresh.json":
    '{"runTimestamp":null,"finalStatus":"failed","stages":[],"inputFiles":{},"outputFiles":{},"trueProbModelRetrained":false,"degradedModeWarnings":[]}',
  "prop-warehouse-audit.json":
    '{"generatedAt":null,"nba":null,"mlb":null}',
};

function main(): void {
  if (!fs.existsSync(PUBLIC_DATA)) {
    fs.mkdirSync(PUBLIC_DATA, { recursive: true });
  }

  for (const { src, name } of COPY_LIST) {
    const dest = path.join(PUBLIC_DATA, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      if (name === "last_run.json") {
        try {
          const raw = fs.readFileSync(src, "utf8");
          const data = JSON.parse(raw) as { ts?: string };
          console.log(`[COPY] copied ${name} → public/data/${name} (ts=${data.ts ?? "?"})`);
        } catch {
          console.log(`[COPY] copied ${name} → public/data/${name}`);
        }
      } else {
        console.log(`[COPY] copied ${name} → public/data/${name}`);
      }
    } else {
      const csvPlaceholder = OPTIONAL_CSV_PLACEHOLDERS[name];
      const jsonPlaceholder = OPTIONAL_JSON_PLACEHOLDERS[name];
      if (csvPlaceholder) {
        fs.writeFileSync(dest, csvPlaceholder + "\n", "utf8");
        console.log(`[COPY] placeholder ${name} (source not found)`);
      } else if (jsonPlaceholder) {
        fs.writeFileSync(dest, jsonPlaceholder, "utf8");
        console.log(`[COPY] placeholder ${name} (source not found)`);
      } else {
        console.log(`[COPY] skipped ${name} (not found)`);
      }
    }
  }
  // Generate perf_summary.json from perf_tracker.jsonl for dashboard hit-rate tracking
  const trackerPath = path.join(ROOT, "data", "perf_tracker.jsonl");
  if (fs.existsSync(trackerPath)) {
    try {
      const lines = fs.readFileSync(trackerPath, "utf8").split("\n").filter((l) => l.trim());
      interface TrackerRow {
        date: string;
        leg_id: string;
        player: string;
        stat: string;
        line: number;
        trueProb: number;
        projectedEV: number;
        kelly: number;
        card_tier: number;
        result?: 0 | 1;
        platform?: string;
        structure?: string;
      }
      const rows: TrackerRow[] = [];
      for (const line of lines) {
        try {
          rows.push(JSON.parse(line) as TrackerRow);
        } catch { /* skip */ }
      }
      const graded = rows.filter((r) => r.result === 0 || r.result === 1);
      const hits = graded.filter((r) => r.result === 1).length;
      const misses = graded.filter((r) => r.result === 0).length;
      const pending = rows.length - graded.length;

      function periodStats(filtered: TrackerRow[]) {
        const g = filtered.filter((r) => r.result === 0 || r.result === 1);
        const h = g.filter((r) => r.result === 1).length;
        return { total: g.length, hits: h, misses: g.length - h, hitRate: g.length > 0 ? h / g.length : 0, pending: filtered.length - g.length };
      }

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const oneWeekAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const oneMonthAgo = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      const oneYearAgo = new Date(today.getTime() - 365 * 86400000).toISOString().slice(0, 10);

      const t1Rows = rows.filter((r) => r.card_tier === 1);
      const t2Rows = rows.filter((r) => r.card_tier === 2);

      const summary = {
        generated: new Date().toISOString(),
        totalLegs: rows.length,
        graded: graded.length,
        hits,
        misses,
        pending,
        hitRate: graded.length > 0 ? hits / graded.length : 0,
        daily: periodStats(rows.filter((r) => r.date === todayStr)),
        weekly: periodStats(rows.filter((r) => r.date >= oneWeekAgo)),
        monthly: periodStats(rows.filter((r) => r.date >= oneMonthAgo)),
        yearly: periodStats(rows.filter((r) => r.date >= oneYearAgo)),
        lifetime: periodStats(rows),
        bestBets: {
          daily: periodStats(t1Rows.filter((r) => r.date === todayStr)),
          weekly: periodStats(t1Rows.filter((r) => r.date >= oneWeekAgo)),
          monthly: periodStats(t1Rows.filter((r) => r.date >= oneMonthAgo)),
          yearly: periodStats(t1Rows.filter((r) => r.date >= oneYearAgo)),
          lifetime: periodStats(t1Rows),
        },
        strong: {
          daily: periodStats(t2Rows.filter((r) => r.date === todayStr)),
          weekly: periodStats(t2Rows.filter((r) => r.date >= oneWeekAgo)),
          monthly: periodStats(t2Rows.filter((r) => r.date >= oneMonthAgo)),
          yearly: periodStats(t2Rows.filter((r) => r.date >= oneYearAgo)),
          lifetime: periodStats(t2Rows),
        },
      };
      const dest = path.join(PUBLIC_DATA, "perf_summary.json");
      fs.writeFileSync(dest, JSON.stringify(summary, null, 2), "utf8");
      console.log(`[COPY] generated perf_summary.json (${graded.length} graded, ${hits} hits, ${misses} misses)`);
    } catch (e) {
      console.log(`[COPY] perf_summary.json generation failed: ${(e as Error).message}`);
    }
  } else {
    console.log("[COPY] skipped perf_summary.json (perf_tracker.jsonl not found)");
  }

  console.log("[COPY] To see the latest run time on the site, run the optimizer first (scripts/run_optimizer.ps1), then npm run web:deploy from this project root.");
}

if (require.main === module) {
  main();
}
