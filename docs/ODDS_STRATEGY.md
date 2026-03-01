# Odds strategy: SGO primary, TheRundown backup

- **NBA only** for now; other leagues once NBA is flawless.
- **Same stats** for both providers (see `src/config/nba_props.ts`).

## SGO (primary)

- **Role:** Main odds source; watch this data first.
- **Limits:** 2.5k objects/month, 10 req/min, 10 min update frequency.
- **Books:** FanDuel, DraftKings, BetMGM, Caesars, ESPN BET, Bovada, Unibet, PointsBet, William Hill.
- We only keep NBA and only the stat allowlist (points, rebounds, assists, threes, pra, pr, pa, ra) to stay within quota.

## TheRundown (backup)

- **Role:** Backup when SGO is skipped or fails; also strong sharp books.
- **Limits:** Resets daily (e.g. 20k data points/day); use ~2 pulls per day so we don’t burn quota.
- **Books:** Pinnacle, FanDuel, DraftKings (Pinnacle, FD, DK are strong sharps).
- Same NBA stats as SGO (market IDs 29, 35, 38, 39, 93, 99, 297, 298).

## Flow

1. Try SGO first (respect daily call limit and cache).
2. If SGO unavailable or empty, fall back to TheRundown.
3. Merge and EV logic use the same stat set either way.

See `src/merge_odds.ts` for primary/backup logic.
