# Optimizer Runbook

All commands run from the **repo root** (`nba-props-optimizer/`).

---

## Prerequisites

```powershell
# One-time: install deps + build
npm install
npx tsc -p .
pip install gspread oauth2client   # for Sheets push scripts
```

Ensure `.env` has:
- `SGO_API_KEY` — SportsGameOdds API key
- `ENGINE_MODE=local` — fast local EV (use `sheets` only for payout validation)
- `ALLOWED_PP_LEAGUES` — comma-separated, e.g. `NBA` or `NBA,NFL,NHL,MLB`
- `ALLOWED_UD_LEAGUES` — same format

---

## 1. PrizePicks-Only Run

```powershell
# Build
npx tsc -p .

# Run optimizer (produces prizepicks-legs.csv + prizepicks-cards.csv)
node dist/run_optimizer.js

# Push to Google Sheets
python sheets_push_legs.py
python sheets_push_cards.py
```

**Output files:** `prizepicks-legs.csv`, `prizepicks-cards.csv`, `prizepicks-legs.json`, `prizepicks-cards.json`
**Sheets tabs updated:** `Legs`, `Cards_Data` (PP rows)

---

## 2. Underdog-Only Run

```powershell
# Build
npx tsc -p .

# Run optimizer (produces underdog-legs.csv + underdog-cards.csv)
node dist/run_underdog_optimizer.js

# Push to Google Sheets
python sheets_push_underdog_legs.py
python sheets_push_cards.py
```

**Output files:** `underdog-legs.csv`, `underdog-cards.csv`, `underdog-legs.json`, `underdog-cards.json`
**Sheets tabs updated:** `UD-Legs`, `Cards_Data` (UD rows)

---

## 3. Combined Run (Both Sites)

```powershell
# Build once
npx tsc -p .

# Run both optimizers
node dist/run_optimizer.js
node dist/run_underdog_optimizer.js

# Push all data to Sheets
python sheets_push_legs.py
python sheets_push_underdog_legs.py
python sheets_push_cards.py
```

**Sheets tabs updated:** `Legs`, `UD-Legs`, `Cards_Data` (PP + UD rows)

---

## 4. Multi-Sport Configuration

Set leagues in `.env` before running:

```ini
# NBA only (default)
ALLOWED_PP_LEAGUES=NBA
ALLOWED_UD_LEAGUES=NBA

# NBA + NFL
ALLOWED_PP_LEAGUES=NBA,NFL
ALLOWED_UD_LEAGUES=NBA,NFL

# All sports
ALLOWED_PP_LEAGUES=NBA,NFL,NHL,MLB
ALLOWED_UD_LEAGUES=NBA,NFL,NHL,MLB
```

The optimizer fetches **only** the leagues you specify. SGO odds are always fetched for all supported leagues (NBA, NFL, NHL, MLB) to maximize merge coverage.

---

## 5. Wrapper Scripts

### `run_pp.ps1` — PrizePicks only
```powershell
npx tsc -p .
node dist/run_optimizer.js
python sheets_push_legs.py
python sheets_push_cards.py
Write-Host "PrizePicks run complete"
```

### `run_ud.ps1` — Underdog only
```powershell
npx tsc -p .
node dist/run_underdog_optimizer.js
python sheets_push_underdog_legs.py
python sheets_push_cards.py
Write-Host "Underdog run complete"
```

### `run_both.ps1` — Combined
```powershell
npx tsc -p .
node dist/run_optimizer.js
node dist/run_underdog_optimizer.js
python sheets_push_legs.py
python sheets_push_underdog_legs.py
python sheets_push_cards.py
Write-Host "Combined run complete"
```

---

## 6. Web UI (Dashboard)

The project includes a local web dashboard for running optimizers and browsing results.

### Start the backend server

```powershell
# Option A: dev mode (ts-node, auto-restart not included)
npm run dev-server

# Option B: compiled mode
npx tsc -p .
npm run start-server
```

Server runs on `http://localhost:4000` (override with `SERVER_PORT` env var).

### Start the React frontend (dev mode)

```powershell
cd web
npm install   # first time only
npm run dev   # Vite dev server on http://localhost:3000
```

The Vite dev server proxies `/api/*` requests to the Express backend on port 4000.

### Production build

```powershell
cd web
npm run build   # outputs to web/dist/
```

The Express server serves `web/dist/` as static files, so after building you only need the backend running.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/run/pp` | Run PrizePicks optimizer + push to Sheets |
| POST | `/api/run/ud` | Run Underdog optimizer + push to Sheets |
| POST | `/api/run/both` | Run both sequentially |
| GET | `/api/status/:jobId` | Poll job status and logs |
| GET | `/api/cards?site=PP&minEv=0.05&slip=6F` | Read card data from JSON files |
| GET | `/api/legs?site=UD&minEdge=0.02&league=NBA` | Read leg data from JSON files |

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot find module` | Run `npx tsc -p .` to rebuild |
| `0 merged picks` | Check `SGO_API_KEY` in `.env`; SGO may be rate-limited |
| `Too few legs` | Lower `MIN_EDGE_PER_LEG` / `MIN_LEG_EV` in `run_optimizer.ts` |
| Sheets not updating | Run the `python sheets_push_*.py` scripts after optimizer |
| `ENGINE_MODE=sheets` slow | Switch to `ENGINE_MODE=local` in `.env` |
| UD API 403 | Underdog may require auth; use scraped file fallback |
| UD legs excluded unexpectedly | Check `IsNonStandardOdds` column; set `UD_INCLUDE_NON_STANDARD_ODDS=true` to include varied-multiplier legs |
| Web UI won't start | Ensure `npm install` in both root and `web/` dirs |
| Web UI can't reach API | Start backend first (`npm run dev-server`), check port 4000 |

---

## 8. Data Flow

```
PrizePicks API ──► fetch_props.ts ──► merge_odds.ts ──► calculate_ev.ts ──► run_optimizer.ts
                                          ▲                                      │
SGO Odds API ──► fetch_sgo_odds.ts ───────┘                                      │
                                                                                  ▼
                                                              prizepicks-legs.csv + cards.csv
                                                                                  │
                                                              sheets_push_legs.py ──► Legs tab
                                                              sheets_push_cards.py ──► Cards_Data tab

Underdog API ──► fetch_underdog_props.ts ──► merge_odds.ts ──► run_underdog_optimizer.ts
                                                ▲                        │
                                                │                        ▼
                                    (same SGO)          underdog-legs.csv + cards.csv
                                                                         │
                                                 sheets_push_underdog_legs.py ──► UD-Legs tab
                                                 sheets_push_cards.py ──► Cards_Data tab
```
