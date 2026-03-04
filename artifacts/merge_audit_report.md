# Merge & UD Factor Audit Report

## UD Factor <1 Backtest (2026-03-03)

- **Period:** 30 days × 500 simulations
- **Bankroll:** $600
- **Data:** underdog-cards.csv (current run = Decline strategy)

### Results

| Strategy | Cards | Total Kelly | Sharpe | MaxDD | Playable (40%+) |
|----------|-------|-------------|--------|-------|-----------------|
| Decline  | 800 | 48.67 units | 0.80 | -681.8% | 12 |
| Include  | 1200 | 25.72 units | 0.89 | -261.5% | 0 |

**Recommendation:** **Decline** — Higher Total Kelly (48.67 vs 25.72). More playable cards at 40%+ EV (12 vs 0). Primary criterion is Kelly.

**Code:** Keep current filter (decline factor<1). No change.

## Deploy

```bash
npm run generate:production
```

**IONOS cron (5:37 PM validate):**
```
cd /dfs && node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines
```
Deploy via FileZilla → upload `ionos-deploy.zip` → extract on server → cron runs generate.
