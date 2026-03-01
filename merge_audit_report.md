# Merge audit report

Generated: 2026-02-28T23:01:21.870Z

> **Underdog focus:** 88/392 picks matched (22.4%); dominant failure = **line_diff (185 of 304)**.

## Underdog failure breakdown

Where Underdog picks are failing the merge (use this to fix aliases, stat mapping, or line tolerance):

| Metric | Count | % of total |
|--------|-------|------------|
| Total Underdog picks | 392 | 100% |
| Matched | 88 | 22.4% |
| No candidate (name/stat not in odds) | 114 | 29.1% |
| Line diff > 1 | 185 | 47.2% |
| Juice too extreme | 5 | 1.3% |

**Where Underdog fails most:** `line_diff` (185 of 304 unmatched).

### Top stat types driving no_candidate failures

| Stat | no_candidate count |
|------|---------------------|
| points | 61 ← likely absent players |
| assists | 19 |
| rebounds | 17 |
| steals | 15 ← not in odds feed (pre-filtered in v2+) |
| blocks | 2 ← not in odds feed (pre-filtered in v2+) |

### Players with 0% match rate (all props = no_candidate)

These players have no odds coverage in SGO/TheRundown. No alias fix can help — they simply have no odds data.

- Ja'Kobe Walter
- Tristan Vukcevic
- De'Anthony Melton
- Will Richard
- Ace Bailey
- Herb Jones
- Anthony Edwards
- Nikola Jokic
- Julius Randle
- Rudy Gobert
- Donte DiVincenzo
- Jaden McDaniels
- Ayo Dosunmu
- Naz Reid
- Bones Hyland

### Stat merge matrix

| Stat | Total | Matched | Match% | no_candidate | line_diff | juice |
|------|-------|---------|--------|--------------|-----------|-------|
| points | 265 | 33 | 12% | 61 | 171 | 0 |
| rebounds | 54 | 29 | 54% | 17 | 8 | 0 |
| assists | 50 | 25 | 50% | 19 | 6 | 0 |
| steals | 20 | 1 | 5% | 15 | 0 | 4 |
| blocks | 3 | 0 | 0% | 2 | 0 | 1 |

> **Guide:** `no_candidate` = player/stat not in odds feed; `line_diff` = Underdog alt lines (unfixable); `juice` = steep chalk (REB/AST expected).

## By site

| Site | Total | Matched | no_candidate | line_diff | juice |
|-----|-------|---------|--------------|-----------|-------|
| underdog | 392 | 88 | 114 | 185 | 5 |
| prizepicks | 85 | 0 | 85 | 0 | 0 |

## Summary

| Metric | Count |
|--------|-------|
| Total picks | 477 |
| Matched | 88 |
| No candidate (name/stat missing in odds) | 199 |
| Line diff > 1 | 185 |
| Juice too extreme | 5 |

## Suggested aliases

Add these to `PLAYER_NAME_ALIASES` in `src/merge_odds.ts` if the mapping is correct (same player, different spelling):

- `"anthony edwards": "luka doncic"`
- `"julius randle": "luka doncic"`
- `"rudy gobert": "zion williamson"`

## Line-diff sample

Name matched but odds line differed by more than 1.
- **122** are alternate prop lines far from the main odds line (delta > 5) — expected and unfixable without per-alt-line odds.

| player | stat | pick line | best odds line | delta |
|--------|------|-----------|----------------|-------|
| Scottie Barnes | points | 31.5 | 17.5 | 14.0 |
| Scottie Barnes | points | 13.5 | 17.5 | 4.0 |
| Scottie Barnes | points | 26.5 | 17.5 | 9.0 |
| Scottie Barnes | points | 23.5 | 17.5 | 6.0 |
| Scottie Barnes | points | 4.5 | 17.5 | 13.0 |
| Scottie Barnes | points | 8.5 | 17.5 | 9.0 |
| Scottie Barnes | points | 42.75 | 17.5 | 25.3 |
| Scottie Barnes | points | 3.5 | 17.5 | 14.0 |
| Scottie Barnes | points | 16.5 | 17.5 | 1.0 |
| Scottie Barnes | points | 4.5 | 17.5 | 13.0 |
| Brandon Ingram | points | 31.5 | 22.5 | 9.0 |
| Brandon Ingram | points | 9.5 | 22.5 | 13.0 |
| Brandon Ingram | points | 27.5 | 22.5 | 5.0 |
| Brandon Ingram | points | 25.5 | 22.5 | 3.0 |
| Brandon Ingram | points | 5.5 | 22.5 | 17.0 |
| Brandon Ingram | points | 8.5 | 22.5 | 14.0 |
| Brandon Ingram | points | 37.75 | 22.5 | 15.3 |
| Brandon Ingram | points | 10.5 | 22.5 | 12.0 |
| Brandon Ingram | points | 16.5 | 22.5 | 6.0 |
| Brandon Ingram | points | 4.5 | 22.5 | 18.0 |
| ... and 165 more | | | |

## SGO quota log

Last 10 SGO API calls (from `quota_log.txt`):

```
2026-02-27T11:00:39.088Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=370 | includeAltLines=true
2026-02-27T11:00:39.154Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=370 | includeAltLines=true
2026-02-27T17:01:29.706Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=509 | includeAltLines=true
2026-02-28T00:03:46.453Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=553 | includeAltLines=true
2026-02-28T11:00:33.563Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=424 | includeAltLines=true
2026-02-28T16:10:11.441Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=482 | includeAltLines=true
2026-02-28T16:13:56.860Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=482 | includeAltLines=true
2026-02-28T16:17:24.340Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=484 | includeAltLines=true
2026-02-28T17:01:43.937Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=490 | includeAltLines=true
2026-02-28T18:37:26.331Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=483 | includeAltLines=true
```

> **SGO raw cache:** 424 rows | 478 main + 0 alt lines | fetched 2026-02-28T11:00:33.564Z (721m ago)

## Juice failures

Line matched but odds were too steep (worse than -250 implied probability). These are correctly filtered — the edge is not real.

| Stat | Count |
|------|-------|
| steals | 4 |
| blocks | 1 |

> **Note:** rebounds and assists for role players are often heavily juiced. This is expected behavior, not a data issue.
