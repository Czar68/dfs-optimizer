# TheRundown API — Available Market IDs

Reference: [docs.therundown.io/reference/markets](https://docs.therundown.io/reference/markets)

To fetch the live list from the API (requires key):

```bash
curl "https://therundown.io/api/v2/markets?key=YOUR_API_KEY"
```

---

## Prematch Markets

| Market | ID | Description |
|--------|----|-------------|
| Moneyline | 1 | Winner of the game |
| Point Spread | 2 | Handicap/spread betting |
| Total (Over/Under) | 3 | Combined score total |
| **Player Points** | **29** | Player points scored |
| **Player Turnovers** | **33** | Player turnovers |
| **Player Rebounds** | **35** | Player rebounds |
| **Three Pointers** | **38** | Player three-pointers made |
| **Player Assists** | **39** | Player assists |
| **Double Double** | 87 | Player double-double (Yes/No) |
| **Triple Double** | 88 | Player triple-double (Yes/No) |
| **Player PRA** | **93** | Points + Rebounds + Assists combo |
| Team Totals | 94 | Individual team total score |
| **Player Blocks** | **98** | Player blocks |
| **Player Points + Assists** | **99** | PA combo |
| **Player Points + Rebounds** | **297** | PR combo |
| **Player Rebounds + Assists** | **298** | RA combo |

**Bold** = over/under player props (used in this codebase).  
87/88 are Yes/No props, not numeric over/under.

---

## Live / In-Play Markets

| Market | ID | Prematch Equivalent |
|--------|----|----------------------|
| Live Moneyline | 41 | 1 |
| Live Spread | 42 | 2 |
| Live Total | 43 | 3 |
| Live Player Points | 90 | 29 |
| Live Player Assists | 91 | 39 |
| Live Three Pointers | 92 | 38 |
| Live Team Totals | 96 | 94 |
| Live Player Rebounds | 982 | 35 |
| Live Player Blocks | 983 | 98 |
| Live Player Turnovers | 984 | 33 |
| Live Double Double | 985 | 87 |
| Live Triple Double | 986 | 88 |
| Live Player PRA | 987 | 93 |
| Live Player Points + Rebounds | 988 | 297 |
| Live Player Points + Assists | 989 | 99 |
| Live Player Rebounds + Assists | 990 | 298 |

---

## Usage in this repo

- **Included:** 29, 35, 38, 39, 93, 99, 297, 298 (Points, Rebounds, 3PT, Assists, PRA, PA, PR, RA)
- **Skipped:** 1, 2, 3 (game lines), 33 (turnovers), 87, 88 (DD/TD Yes/No), 94 (team totals), 98 (blocks)
- **Core only** (fewer points): set `THERUNDOWN_MARKETS=core` → `29, 35, 38, 39`

See `src/odds/sources/therundownProps.ts` for `PLAYER_PROP_MARKETS` and `MARKET_ID_TO_STAT`.

---

## Why am I seeing v1 `/sports/{id}/dates` in TheRundown logs?

**This repo only calls v2** (`/api/v2/sports/4/events/{date}` with `market_ids`). It does not call `/api/v1/sports/*/dates`.

The v1 `GET /api/v1/sports/15/dates`, `/api/v1/sports/17/dates`, etc. (sport IDs 15, 17, 19, 25, 26, 27, 28, 29) are typically from:

1. **Another app or script** using the same `THERUNDOWN_API_KEY` (e.g. another project, dashboard, or cron job).
2. **The SportsGameOdds (SGO) / sports-odds-api SDK** if it uses TheRundown under the hood for date discovery across sports.

To stop v1 hits: find what else is using your TheRundown API key (other repos, dashboards, scripts) or which dependency might be calling TheRundown. This codebase only uses v2.
