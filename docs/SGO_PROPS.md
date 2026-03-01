# SGO (Sports Game Odds) – Available props and allowlist

**NBA only for now.** The stats we import from SGO are the **same** as TheRundown; see `src/config/nba_props.ts` (single source of truth).

Your SGO plan (e.g. monthly):

- **2.5k objects per month**
- **10 requests per minute**
- **10 min update frequency**
- **8 leagues** (NFL, NBA, MLB, NHL, College Football, College Basketball, Champions League, MLS)
- **9 bookmakers** (FanDuel, DraftKings, BetMGM, Caesars, ESPN BET, Bovada, Unibet, PointsBet, William Hill)

To stay within limits, we **only keep player props we need** (allowlist), aligned with TheRundown.

---

## All SGO props we currently map (by league)

### NBA

| SGO statID (examples)        | Internal StatCategory   | In allowlist? (NBA) |
|-----------------------------|-------------------------|---------------------|
| points                      | points                  | ✅ Yes              |
| rebounds                    | rebounds                | ✅ Yes              |
| assists                     | assists                 | ✅ Yes              |
| threepointersmade / 3pm / threes | threes           | ✅ Yes              |
| pra / points_rebounds_assists | pra                  | ✅ Yes              |
| points_rebounds / pr        | points_rebounds         | ✅ Yes              |
| points_assists / pa         | points_assists          | ✅ Yes              |
| rebounds_assists / ra       | rebounds_assists        | ✅ Yes              |
| blocks / blk                | blocks                  | ❌ No (excluded)    |
| steals / stl                | steals                  | ❌ No (excluded)    |
| stocks / steals+blocks      | stocks                  | ❌ No (excluded)    |
| turnovers / to              | turnovers               | ❌ No (excluded)    |
| fantasyscore / fantasy_points | fantasy_score         | ❌ No (excluded)    |

### NFL

| SGO statID (examples)   | Internal StatCategory | In allowlist? (NFL) |
|-------------------------|------------------------|---------------------|
| passing_yards           | pass_yards             | ✅ Yes              |
| passing_attempts        | pass_attempts          | ✅ Yes              |
| passing_completions    | pass_completions       | ✅ Yes              |
| passing_touchdowns     | pass_tds               | ✅ Yes              |
| passing_interceptions  | interceptions          | ✅ Yes              |
| rushing_yards           | rush_yards             | ✅ Yes              |
| rushing_attempts        | rush_attempts          | ✅ Yes              |
| rushing+receiving_yards| rush_rec_yards         | ✅ Yes              |
| receiving_yards         | rec_yards              | ✅ Yes              |
| receiving_receptions    | receptions             | ✅ Yes              |

### NHL

| SGO statID (examples) | Internal StatCategory | In allowlist? (NHL) |
|------------------------|------------------------|---------------------|
| points                 | points                 | ✅ Yes              |
| goals                  | goals                  | ✅ Yes              |
| assists                | assists                | ✅ Yes              |
| shots_on_goal / sog    | shots_on_goal          | ✅ Yes              |
| saves                  | saves                  | ✅ Yes              |
| goals_against           | goals_against          | ✅ Yes              |
| blocked_shots / blocks | blocks                 | ✅ Yes              |

### MLB

| SGO statID (examples) | Internal StatCategory | In allowlist? (MLB) |
|------------------------|------------------------|---------------------|
| hits                   | (points)               | ✅ Yes              |
| strikeouts             | (blocks)               | ✅ Yes              |
| total_bases            | (rebounds)             | ✅ Yes              |

---

## NBA allowlist (same as TheRundown)

We exclude the same “noise” as on TheRundown where possible:

- **Excluded:** turnovers, blocks, steals, stocks, fantasy_score  
- **Included:** points, rebounds, assists, threes, pra, points_rebounds, points_assists, rebounds_assists  

Override via **`SGO_NBA_STATS`** env (comma-separated) if needed.

---

## Where filtering is applied

- **`src/fetch_sgo_odds.ts`**  
  After mapping SGO `statID` → `StatCategory`, we **drop** any prop whose category is not in the allowlist for that league.  
  So we only count/use objects we care about and avoid burning quota on excluded props.

---

## Changing the allowlist

- **Env (recommended):**  
  `SGO_NBA_STATS=points,rebounds,assists,threes,pra,pr,pa,ra`  
  Add/remove stats as needed (e.g. add `blocks` or `steals`).

- **Code:**  
  Edit the default list in `src/fetch_sgo_odds.ts` (constant `SGO_NBA_STAT_ALLOWLIST` or equivalent).

---

## Leagues we request

We only request leagues for the **sports** you run (e.g. `--sports NBA` → only NBA).  
NCAAB/NCAAF are in `sport_config` but the current SGO SDK call in `fetch_sgo_odds.ts` only uses `NBA | NFL | NHL | MLB`. So for an NBA-only run we only hit SGO for NBA, which minimizes objects and requests.
