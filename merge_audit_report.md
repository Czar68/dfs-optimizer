# Merge audit report

Generated: 2026-03-02T23:58:22.115Z

> **Underdog focus:** 159/651 picks matched (24.4%); dominant failure = **line_diff (343 of 492)**.

## Underdog failure breakdown

Where Underdog picks are failing the merge (use this to fix aliases, stat mapping, or line tolerance):

| Metric | Count | % of total |
|--------|-------|------------|
| Total Underdog picks | 651 | 100% |
| Matched | 159 | 24.4% |
| No candidate (name/stat not in odds) | 143 | 22.0% |
| Line diff > 1 | 343 | 52.7% |
| Juice too extreme | 6 | 0.9% |

**Where Underdog fails most:** `line_diff` (343 of 492 unmatched).

### Top stat types driving no_candidate failures

| Stat | no_candidate count |
|------|---------------------|
| points | 66 ← likely absent players |
| assists | 32 |
| rebounds | 22 |
| steals | 20 ← not in odds feed (pre-filtered in v2+) |
| blocks | 3 ← not in odds feed (pre-filtered in v2+) |

### Players with 0% match rate (all props = no_candidate)

These players have no odds coverage in SGO/TheRundown. No alias fix can help — they simply have no odds data.

- Dorian Finney-Smith
- Josh Okogie
- Juju Reese
- Justin Champagnie
- Ron Harper Jr.
- Jonas Valanciunas
- Ace Bailey
- De'Anthony Melton
- Karl-Anthony Towns
- Mitchell Robinson
- Jamal Shead
- Ja'Kobe Walter
- Landry Shamet
- De'Aaron Fox
- Harrison Barnes
- Dylan Harper
- Keldon Johnson
- Quentin Grimes
- Adem Bona
- Luke Kornet

### Stat merge matrix

| Stat | Total | Matched | Match% | no_candidate | line_diff | juice |
|------|-------|---------|--------|--------------|-----------|-------|
| points | 449 | 55 | 12% | 66 | 328 | 0 |
| rebounds | 89 | 62 | 70% | 22 | 5 | 0 |
| assists | 79 | 37 | 47% | 32 | 10 | 0 |
| steals | 28 | 5 | 18% | 20 | 0 | 3 |
| blocks | 6 | 0 | 0% | 3 | 0 | 3 |

> **Guide:** `no_candidate` = player/stat not in odds feed; `line_diff` = Underdog alt lines (unfixable); `juice` = steep chalk (REB/AST expected).

## By site

| Site | Total | Matched | no_candidate | line_diff | juice |
|-----|-------|---------|--------------|-----------|-------|
| underdog | 651 | 159 | 143 | 343 | 6 |
| prizepicks | 516 | 340 | 151 | 25 | 0 |

## Summary

| Metric | Count |
|--------|-------|
| Total picks | 1167 |
| Matched | 499 |
| No candidate (name/stat missing in odds) | 294 |
| Line diff > 1 | 368 |
| Juice too extreme | 6 |

## Suggested aliases

Add these to `PLAYER_NAME_ALIASES` in `src/merge_odds.ts` if the mapping is correct (same player, different spelling):

- `"karl-anthony towns": "tyrese maxey"`

## Line-diff sample

Name matched but odds line differed by more than 1.
- **231** are alternate prop lines far from the main odds line (delta > 5) — expected and unfixable without per-alt-line odds.

| player | stat | pick line | best odds line | delta |
|--------|------|-----------|----------------|-------|
| Kevin Durant | points | 33.5 | 23.5 | 10.0 |
| Kevin Durant | points | 9.5 | 23.5 | 14.0 |
| Kevin Durant | points | 28.5 | 23.5 | 5.0 |
| Kevin Durant | points | 28.5 | 23.5 | 5.0 |
| Kevin Durant | points | 6.5 | 23.5 | 17.0 |
| Kevin Durant | points | 9.5 | 23.5 | 14.0 |
| Kevin Durant | points | 39.45 | 23.5 | 16.0 |
| Kevin Durant | points | 4.5 | 23.5 | 19.0 |
| Kevin Durant | points | 12.5 | 23.5 | 11.0 |
| Kevin Durant | points | 17.5 | 23.5 | 6.0 |
| Kevin Durant | points | 3.5 | 23.5 | 20.0 |
| Kevin Durant | points | 4.5 | 23.5 | 19.0 |
| Kevin Durant | points | 5.5 | 23.5 | 18.0 |
| Kevin Durant | points | 17.5 | 23.5 | 6.0 |
| Alperen Sengun | points | 34.5 | 19.5 | 15.0 |
| Alperen Sengun | assists | 6.5 | 5.5 | 1.0 |
| Alperen Sengun | points | 15.5 | 19.5 | 4.0 |
| Alperen Sengun | points | 29.5 | 19.5 | 10.0 |
| Alperen Sengun | points | 25.5 | 19.5 | 6.0 |
| Alperen Sengun | points | 4.5 | 19.5 | 15.0 |
| ... and 348 more | | | |

## SGO quota log

Last 10 SGO API calls (from `quota_log.txt`):

```
2026-03-01T18:13:59.922Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=1011 | includeAltLines=true
2026-03-01T21:10:22.733Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=878 | includeAltLines=true
2026-03-02T01:04:12.422Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=628 | includeAltLines=true
2026-03-02T11:01:16.742Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=413 | includeAltLines=true
2026-03-02T11:01:23.826Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=413 | includeAltLines=true
2026-03-02T17:01:08.772Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=470 | includeAltLines=true
2026-03-02T17:01:15.430Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=470 | includeAltLines=true
2026-03-02T19:02:18.678Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=473 | includeAltLines=true
2026-03-02T21:30:14.574Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=473 | includeAltLines=true
2026-03-02T23:56:09.361Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=549 | includeAltLines=true
```

## Juice failures

Line matched but odds were too steep (worse than -250 implied probability). These are correctly filtered — the edge is not real.

| Stat | Count |
|------|-------|
| blocks | 3 |
| steals | 3 |

> **Note:** rebounds and assists for role players are often heavily juiced. This is expected behavior, not a data issue.
