# Results Tracking for AI Model Training

## What is Stored

Every pipeline run generates a snapshot of cards, legs, and metadata that is
stored in `results/results.db` (SQLite) and dated CSV archives in `results/`.

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `runs` | Pipeline execution metadata | run_id, timestamp, bankroll, odds source, snapshot info, card/leg counts |
| `cards` | Every generated parlay card | card_id, site, sport, flex_type, leg_count, card_ev, edge_pct, win_prob, kelly_stake, best_bet_score/tier, outcome status |
| `legs` | Individual player prop picks | leg_id, player, team, stat_type, line, side, true_prob, edge, over/under odds, book |
| `outcomes` | Settlement results (future) | result (hit/miss/push/void), actual_stat, payout, ROI |

### Stable IDs

- **run_id**: `YYYYMMDD-HHMMSS-<8hex>` — unique per pipeline execution
- **card_id**: SHA-256 hash of `site-flexType-sortedLegIds` — deterministic, dedup-safe
- **leg_id**: Platform-native ID (e.g. `prizepicks-10357113-rebounds-4`)

## Why It Matters

### Training Features (per card)

| Feature | Column | Description |
|---------|--------|-------------|
| Site | `site` | PP vs UD — different payout structures |
| Sport | `sport` | NBA, NHL, etc. — different variance profiles |
| Flex Type | `flex_type` | 3P, 5F, 8P, etc. — structure determines payout |
| Card Type | `card_type` | power vs flex — flex allows partial wins |
| Leg Count | `leg_count` | Parlay length — key risk factor |
| Card EV | `card_ev` | Expected value of the full card |
| Edge % | `edge_pct` | Average edge across legs |
| Win Prob | `win_prob_cash` | Probability of full cash payout |
| Kelly Stake | `kelly_stake` | Recommended wager amount |
| Best Bet Score | `best_bet_score` | Composite risk-aware score |
| Tier | `best_bet_tier` | must_play / strong / small / lottery / skip |

### Training Features (per leg)

| Feature | Column | Description |
|---------|--------|-------------|
| Player | `player` | Player name |
| Team | `team` | Team abbreviation |
| Stat Type | `stat_type` | points, rebounds, assists, etc. |
| Line | `line` | The over/under line |
| True Prob | `true_prob` | Model-estimated probability |
| Edge | `edge` | Leg-level edge vs breakeven |
| Over Odds | `over_odds` | American odds for over |
| Under Odds | `under_odds` | American odds for under |
| Book | `book` | Which sportsbook provided odds |

### Target Variables (outcomes table)

| Field | Description |
|-------|-------------|
| `result` | hit, miss, push, void |
| `actual_stat` | Real stat value (when available) |
| `payout` | Actual dollars received |
| `roi` | Return on investment |

## How Future AI Training Will Use It

### Phase 1: Descriptive Analytics
- Win rate by tier (must_play vs lottery)
- Win rate by leg count
- Win rate by site (PP vs UD)
- Win rate by stat type
- ROI by tier and leg count

### Phase 2: Feature Engineering
- Historical hit rate per player/stat/line combination
- Closing line value (if odds snapshots are stored)
- Time-of-day effects
- Back-to-back game effects
- Home/away splits

### Phase 3: Model Training
- Binary classification: card outcome (win/loss)
- Regression: expected ROI
- Ranking: which cards to prioritize
- Features: all card + leg columns plus derived features
- Target: outcome result and ROI

### Phase 4: Live Model Integration
- Replace or supplement the current scoring formula
- Adjust Kelly sizing based on model confidence
- Dynamic tier thresholds from learned data
- Player-specific adjustments from historical performance

## How to Use

### Export after each pipeline run:
```
python scripts/export_results.py
```

### Dry run (preview without DB write):
```
python scripts/export_results.py --dry-run
```

### Query the database:
```sql
-- Win rate by tier
SELECT best_bet_tier, COUNT(*) as total,
       SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as wins,
       AVG(roi) as avg_roi
FROM cards WHERE status != 'pending'
GROUP BY best_bet_tier;

-- Top players by hit rate
SELECT l.player, l.stat_type, COUNT(*) as legs,
       SUM(CASE WHEN o.result='hit' THEN 1 ELSE 0 END) as hits
FROM legs l JOIN outcomes o ON l.card_id=o.card_id AND l.leg_id=o.leg_id
GROUP BY l.player, l.stat_type
HAVING COUNT(*) >= 5
ORDER BY CAST(hits AS REAL)/legs DESC;
```

### Minimum data for meaningful analysis:
- 30+ runs (about 1 month of daily use)
- Settlement data for at least 50% of cards
- Coverage across multiple stat types and leg counts

## Settlement Integration

Settlement is implemented using **ESPN NBA box scores** (no API key). Scripts:

- **`scripts/espn_boxscore.py`** — Fetches scoreboard + game summaries for a date; returns player → stats for matching to legs.
- **`scripts/settle_results.py`** — Loads pending cards and their legs, fetches actual stats per game date, compares actual vs line/side (over/under), writes `outcomes` (hit/miss/push) and updates card `status` and `settled_at`.
- **`scripts/run_final_results.ps1`** — One command: settle + run `export_results_summary.py` so `results_summary.json` is ready for the dashboard. Options: `-AllPending`, `-Date "YYYY-MM-DD"`, `-DryRun`, `-NoCopy`.

Run from repo root:

```powershell
.\scripts\run_final_results.ps1                  # today's cards, then export
.\scripts\run_final_results.ps1 -AllPending    # all pending cards
.\scripts\run_final_results.ps1 -Date "2026-03-06"
python scripts/settle_results.py --date 2026-03-06   # settle only
python scripts/settle_results.py --all-pending --dry-run
```

This updates the `outcomes` table with hit/miss/push and sets card status (won/lost/partial). Payout/ROI can be added later if you have actual payout data.
