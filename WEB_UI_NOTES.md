# Web UI Scaffold — Design Notes

Lightweight local dashboard for running optimizers and browsing cards.

---

## Architecture

```
┌─────────────────────┐      ┌──────────────────────────┐
│  React Frontend     │ ◄──► │  Express Backend (API)    │
│  (port 3000)        │      │  (port 4000)              │
│                     │      │                           │
│  • Run buttons      │      │  POST /api/run/pp         │
│  • Cards table      │      │  POST /api/run/ud         │
│  • Legs browser     │      │  POST /api/run/both       │
│  • League filters   │      │  GET  /api/cards          │
│  • Copy card helper │      │  GET  /api/legs           │
│                     │      │  GET  /api/status          │
└─────────────────────┘      └──────────────────────────┘
```

---

## Backend Endpoints (Express)

### `POST /api/run/pp`
Spawns `node dist/run_optimizer.js` + `python sheets_push_legs.py` + `python sheets_push_cards.py`.
Returns `{ jobId, status: "started" }`. Poll `/api/status/:jobId` for completion.

### `POST /api/run/ud`
Spawns `node dist/run_underdog_optimizer.js` + `python sheets_push_underdog_legs.py` + `python sheets_push_cards.py`.

### `POST /api/run/both`
Runs PP then UD sequentially, pushes all to Sheets.

### `GET /api/status/:jobId`
Returns `{ status: "running" | "done" | "error", log: string[] }`.

### `GET /api/cards?site=PP&minEv=0.05&slip=6F`
Reads `prizepicks-cards.json` and/or `underdog-cards.json`, filters, returns JSON array.

Query params:
- `site` — `PP`, `UD`, or omit for both
- `minEv` — minimum cardEv filter (decimal)
- `slip` — flexType filter (e.g., `5F`, `6P`)
- `league` — league filter (e.g., `NBA`)

### `GET /api/legs?site=PP&minEdge=0.02`
Reads `prizepicks-legs.json` and/or `underdog-legs.json`, filters, returns JSON array.

Query params:
- `site` — `PP`, `UD`, or omit for both
- `minEdge` — minimum edge filter
- `league` — league filter

---

## Frontend Components (React)

### 1. RunPanel
- Three buttons: **Run PrizePicks**, **Run Underdog**, **Run Both**
- League selector (checkboxes: NBA, NFL, NHL, MLB)
- Status indicator with live log tail
- Disables buttons while a job is running

### 2. CardsTable
- Sortable table: Site, Slip, CardEV%, WinProb, AvgProb, AvgEdge%, PlayerBlock
- Filters: site dropdown, slip type, min EV slider
- Click row → expands to show individual legs with trueProb, edge, book
- **Copy Card** button → copies leg names to clipboard for easy entry on PP/UD apps

### 3. LegsBrowser
- Sortable table: Player, Team, Stat, Line, League, TrueProb, Edge, LegEV, Book
- Filters: league, stat category, min edge
- Search bar for player name

### 4. DashboardHeader
- Last run timestamp
- Leg counts (PP / UD)
- Card counts (PP / UD)
- Engine mode indicator (local / sheets)

---

## Tech Stack

- **Backend:** Express + TypeScript, `child_process.spawn` for optimizer jobs
- **Frontend:** React + Vite + TailwindCSS + shadcn/ui
- **Icons:** Lucide React
- **State:** React Query for API polling
- **No database** — reads JSON files from disk on each request

---

## File Structure (proposed)

```
web/
├── server/
│   ├── index.ts          # Express app entry
│   ├── routes/
│   │   ├── run.ts        # POST /api/run/*
│   │   ├── cards.ts      # GET /api/cards
│   │   ├── legs.ts       # GET /api/legs
│   │   └── status.ts     # GET /api/status/:jobId
│   └── jobs.ts           # Job manager (spawn + track)
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── RunPanel.tsx
│   │   │   ├── CardsTable.tsx
│   │   │   ├── LegsBrowser.tsx
│   │   │   └── DashboardHeader.tsx
│   │   └── api.ts        # fetch wrappers
│   ├── index.html
│   └── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## Implementation Priority

1. **Phase 1:** Backend endpoints (run + cards + legs) — functional CLI replacement
2. **Phase 2:** Basic React UI with cards table and run buttons
3. **Phase 3:** Polish — copy card helper, league filters, live log streaming
4. **Phase 4:** Optional — WebSocket for real-time log streaming during runs

---

## Copy Card Helper

The most useful UI feature. When clicking "Copy" on a card row:
1. Look up each leg ID → get `Player – stat line`
2. Format as clipboard text:
   ```
   6F Card (EV: +14.4%)
   ─────────────────────
   Cade Cunningham – rebounds 5
   Jalen Brunson – rebounds 7
   Tyrese Maxey – rebounds 6
   ...
   ```
3. User pastes directly into PP/UD app search bars.

---

## Getting Started (future)

```powershell
# From repo root
cd web
npm install
npm run dev        # starts both Express (4000) and Vite (3000)
```

## Implementation Status

**Backend:** Implemented in `src/server.ts` (Express, compiles to `dist/server.js`).
- `npm run dev-server` — runs via ts-node
- `npm run start-server` — runs compiled JS

**Frontend:** Implemented in `web/` (Vite + React + TailwindCSS).
- `cd web && npm run dev` — Vite dev server on port 3000 (proxies `/api` to 4000)
- `cd web && npm run build` — production build to `web/dist/`

### Actual File Structure

```
src/
└── server.ts              # Express API (port 4000)

web/
├── package.json
├── tsconfig.json
├── vite.config.ts         # Vite + proxy config
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── src/
    ├── main.tsx           # React entry
    ├── App.tsx            # RunPanel + CardsTable + LegsBrowser
    ├── api.ts             # fetch wrappers for /api/*
    ├── index.css          # Tailwind imports
    └── vite-env.d.ts
```

### Features Implemented

- **RunPanel:** PrizePicks / Underdog / Both run buttons with job status polling and live log tail
- **CardsTable:** Sortable table with site/slip filters, expandable leg detail rows, Copy Card button
- **LegsBrowser:** Sortable table with site/league/player search filters
- **Dark theme** with color-coded EV values (green for high EV, yellow for moderate, red for negative)
