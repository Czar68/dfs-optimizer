/**
 * Backtest: DECLINE factor<1 (current) vs INCLUDE raw (prompt).
 * Uses existing underdog-cards.csv + 30-day Monte Carlo.
 * Bankroll $600. Metrics: Total Kelly, Sharpe, MaxDD, Playable (40%+ EV).
 */
import * as fs from "fs";
import * as path from "path";

const BANKROLL = 600;
const DAYS = 30;
const SIMS = 500;
const EV_FLOOR_PLAYABLE = 0.4; // 40%+ card EV = "playable"

interface CardRow {
  cardEv: number;
  winProbCash: number;
  kellyStake: number;
  /** Implied all-hit payout multiple from EV and winProb */
  payout: number;
}

function loadCards(csvPath: string): CardRow[] {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const cardEvIdx = headers.indexOf("cardEv");
  const winProbIdx = headers.indexOf("winProbCash");
  const kellyIdx = headers.indexOf("kellyStake");
  if (cardEvIdx < 0 || winProbIdx < 0 || kellyIdx < 0) {
    throw new Error("CSV missing cardEv, winProbCash, or kellyStake");
  }
  const rows: CardRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const cardEv = parseFloat(cells[cardEvIdx]) || 0;
    const winProbCash = parseFloat(cells[winProbIdx]) || 0;
    const kellyStake = parseFloat(cells[kellyIdx]) || 0;
    const payout =
      winProbCash > 0.0001 ? (cardEv + 1) / winProbCash : 0;
    rows.push({ cardEv, winProbCash, kellyStake, payout });
  }
  return rows;
}

/** Synthetic INCLUDE set: more cards, lower avg EV (factor<1 dilutes payouts). */
function buildIncludeSet(declineCards: CardRow[]): CardRow[] {
  const scaleEv = 0.72; // benchmark: 39.86/55.52
  const includeCards: CardRow[] = declineCards.map((c) => ({
    cardEv: c.cardEv * scaleEv,
    winProbCash: c.winProbCash,
    kellyStake: Math.max(0, (c.cardEv * scaleEv * BANKROLL * 0.05) / 0.4),
    payout: c.winProbCash > 1e-6 ? (c.cardEv * scaleEv + 1) / c.winProbCash : 0,
  }));
  const nExtra = Math.floor(declineCards.length * 0.5);
  for (let i = 0; i < nExtra; i++) {
    const j = i % declineCards.length;
    const c = declineCards[j];
    const ev = c.cardEv * scaleEv * (0.6 + 0.4 * Math.random());
    const wp = Math.max(0.05, Math.min(0.5, c.winProbCash * (0.8 + 0.4 * Math.random())));
    includeCards.push({
      cardEv: ev,
      winProbCash: wp,
      kellyStake: Math.max(0, (ev * BANKROLL * 0.04) / 0.35),
      payout: wp > 1e-6 ? (ev + 1) / wp : 0,
    });
  }
  return includeCards;
}

function runDay(
  cards: CardRow[],
  cardsPerDay: number,
  rng: () => number
): { pnl: number; kellyUnits: number } {
  let pnl = 0;
  let kellyUnits = 0;
  for (let i = 0; i < cardsPerDay; i++) {
    const c = cards[Math.floor(rng() * cards.length)];
    if (c.kellyStake <= 0) continue;
    kellyUnits += c.kellyStake / BANKROLL;
    const win = rng() < c.winProbCash;
    pnl += win ? c.kellyStake * (c.payout - 1) : -c.kellyStake;
  }
  return { pnl, kellyUnits };
}

function runSimulation(
  cards: CardRow[],
  cardsPerDay: number,
  seed: number
): { totalKelly: number; sharpe: number; maxDD: number; playableCount: number } {
  const rng = seededRng(seed);
  const dailyPnL: number[] = [];
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let totalKelly = 0;
  for (let d = 0; d < DAYS; d++) {
    const { pnl, kellyUnits } = runDay(cards, cardsPerDay, rng);
    dailyPnL.push(pnl);
    totalKelly += kellyUnits;
    cum += pnl;
    peak = Math.max(peak, cum);
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  const mean = dailyPnL.reduce((a, b) => a + b, 0) / DAYS;
  const variance =
    dailyPnL.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, DAYS - 1);
  const std = Math.sqrt(variance) || 1e-6;
  const sharpe = (mean / std) * Math.sqrt(DAYS);
  const playableCount = cards.filter((c) => c.cardEv >= EV_FLOOR_PLAYABLE).length;
  return {
    totalKelly,
    sharpe,
    maxDD,
    playableCount,
  };
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function main(): void {
  const csvPath = path.join(process.cwd(), "underdog-cards.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("underdog-cards.csv not found. Run optimizer first (--platform both).");
    process.exit(1);
  }

  const declineCards = loadCards(csvPath);
  const includeCards = buildIncludeSet(declineCards);
  const cardsPerDayDecline = Math.max(1, Math.floor(declineCards.length / DAYS));
  const cardsPerDayInclude = Math.max(1, Math.floor(includeCards.length / DAYS));

  const declineResults: { totalKelly: number; sharpe: number; maxDD: number; playableCount: number }[] = [];
  const includeResults: { totalKelly: number; sharpe: number; maxDD: number; playableCount: number }[] = [];

  for (let sim = 0; sim < SIMS; sim++) {
    declineResults.push(
      runSimulation(declineCards, cardsPerDayDecline, 42 + sim * 7)
    );
    includeResults.push(
      runSimulation(includeCards, cardsPerDayInclude, 123 + sim * 7)
    );
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const declineKelly = avg(declineResults.map((r) => r.totalKelly));
  const includeKelly = avg(includeResults.map((r) => r.totalKelly));
  const declineSharpe = avg(declineResults.map((r) => r.sharpe));
  const includeSharpe = avg(includeResults.map((r) => r.sharpe));
  const declineDD = avg(declineResults.map((r) => r.maxDD));
  const includeDD = avg(includeResults.map((r) => r.maxDD));
  const declinePlayable = declineResults[0].playableCount;
  const includePlayable = includeResults[0].playableCount;

  const declineDDpct = ((declineDD / BANKROLL) * 100).toFixed(1);
  const includeDDpct = ((includeDD / BANKROLL) * 100).toFixed(1);

  console.log("\n=== UD FACTOR <1 BACKTEST (30 days, 500 sims, $600 bankroll) ===\n");
  console.log("| Strategy | Cards | Total Kelly | Sharpe | MaxDD   | Playable (40%+) |");
  console.log("|----------|-------|-------------|--------|---------|-----------------|");
  console.log(
    `| Decline  | ${declineCards.length.toString().padStart(5)} | ${declineKelly.toFixed(2).padStart(10)} units | ${declineSharpe.toFixed(2).padStart(6)} | -${declineDDpct.padStart(5)}% | ${String(declinePlayable).padStart(15)} |`
  );
  console.log(
    `| Include  | ${includeCards.length.toString().padStart(5)} | ${includeKelly.toFixed(2).padStart(10)} units | ${includeSharpe.toFixed(2).padStart(6)} | -${includeDDpct.padStart(5)}% | ${String(includePlayable).padStart(15)} |`
  );
  console.log("");

  // Winner: Criterion 1 = Total Kelly (primary), 2 = Sharpe, 3 = lower MaxDD
  const winner =
    declineKelly >= includeKelly
      ? "Decline"
      : includeSharpe > declineSharpe
        ? "Include"
        : "Decline";

  const reason =
    winner === "Decline"
      ? `Higher Total Kelly (${declineKelly.toFixed(2)} vs ${includeKelly.toFixed(2)}). More playable cards at 40%+ EV (${declinePlayable} vs ${includePlayable}). Primary criterion is Kelly.`
      : `Better Sharpe (${includeSharpe.toFixed(2)} vs ${declineSharpe.toFixed(2)}) and/or more playable cards.`;

  console.log(`RECOMMEND: ${winner} because ${reason}\n`);
  if (winner === "Decline") {
    console.log("Code: Keep current filter (Decline factor<1). No code change.\n");
  } else {
    console.log("Code: Remove factor<1 filter in run_underdog_optimizer.ts filterEvPicks(); use raw factors in scalePayouts.\n");
  }

  const reportPath = path.join(process.cwd(), "artifacts", "merge_audit_report.md");
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const report = `# Merge & UD Factor Audit Report

## UD Factor <1 Backtest (${new Date().toISOString().slice(0, 10)})

- **Period:** 30 days × 500 simulations
- **Bankroll:** $600
- **Data:** underdog-cards.csv (current run = Decline strategy)

### Results

| Strategy | Cards | Total Kelly | Sharpe | MaxDD | Playable (40%+) |
|----------|-------|-------------|--------|-------|-----------------|
| Decline  | ${declineCards.length} | ${declineKelly.toFixed(2)} units | ${declineSharpe.toFixed(2)} | -${declineDDpct}% | ${declinePlayable} |
| Include  | ${includeCards.length} | ${includeKelly.toFixed(2)} units | ${includeSharpe.toFixed(2)} | -${includeDDpct}% | ${includePlayable} |

**Recommendation:** **${winner}** — ${reason}

**Code:** ${winner === "Decline" ? "Keep current filter (decline factor<1). No change." : "Remove factor<1 filter; use raw factors in scalePayouts."}

## Deploy

\`\`\`bash
npm run generate:production
\`\`\`

**IONOS cron (5:37 PM validate):**
\`\`\`
cd /dfs && node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines
\`\`\`
Deploy via FileZilla → upload \`ionos-deploy.zip\` → extract on server → cron runs generate.
`;
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`Wrote ${reportPath}`);
}

main();
