# Merge audit report

Generated: 2026-03-01T23:01:05.504Z

> **Underdog focus:** 163/659 picks matched (24.7%); dominant failure = **line_diff (385 of 496)**.

## Underdog failure breakdown

Where Underdog picks are failing the merge (use this to fix aliases, stat mapping, or line tolerance):

| Metric | Count | % of total |
|--------|-------|------------|
| Total Underdog picks | 659 | 100% |
| Matched | 163 | 24.7% |
| No candidate (name/stat not in odds) | 105 | 15.9% |
| Line diff > 1 | 385 | 58.4% |
| Juice too extreme | 6 | 0.9% |

**Where Underdog fails most:** `line_diff` (385 of 496 unmatched).

### Top stat types driving no_candidate failures

| Stat | no_candidate count |
|------|---------------------|
| points | 41 ← likely absent players |
| assists | 28 |
| rebounds | 18 |
| steals | 15 ← not in odds feed (pre-filtered in v2+) |
| blocks | 3 ← not in odds feed (pre-filtered in v2+) |

### Players with 0% match rate (all props = no_candidate)

These players have no odds coverage in SGO/TheRundown. No alias fix can help — they simply have no odds data.

- Jonathan Isaac
- Jett Howard
- Zaccharie Risacher
- Corey Kispert
- Nickeil Alexander-Walker
- Jock Landale
- Adem Bona
- Shai Gilgeous-Alexander
- Lu Dort
- Herb Jones
- Jaxson Hayes
- Daeqwon Plowden

### Stat merge matrix

| Stat | Total | Matched | Match% | no_candidate | line_diff | juice |
|------|-------|---------|--------|--------------|-----------|-------|
| points | 457 | 49 | 11% | 41 | 367 | 0 |
| rebounds | 89 | 63 | 71% | 18 | 8 | 0 |
| assists | 76 | 39 | 51% | 28 | 9 | 0 |
| steals | 30 | 8 | 27% | 15 | 1 | 6 |
| blocks | 7 | 4 | 57% | 3 | 0 | 0 |

> **Guide:** `no_candidate` = player/stat not in odds feed; `line_diff` = Underdog alt lines (unfixable); `juice` = steep chalk (REB/AST expected).

## By site

| Site | Total | Matched | no_candidate | line_diff | juice |
|-----|-------|---------|--------------|-----------|-------|
| underdog | 659 | 163 | 105 | 385 | 6 |
| prizepicks | 568 | 303 | 181 | 83 | 1 |

## Summary

| Metric | Count |
|--------|-------|
| Total picks | 1227 |
| Matched | 466 |
| No candidate (name/stat missing in odds) | 286 |
| Line diff > 1 | 468 |
| Juice too extreme | 7 |

## Suggested aliases

Add these to `PLAYER_NAME_ALIASES` in `src/merge_odds.ts` if the mapping is correct (same player, different spelling):

- `"nickeil alexander-walker": "tyrese maxey"`

## Line-diff sample

Name matched but odds line differed by more than 1.
- **252** are alternate prop lines far from the main odds line (delta > 5) — expected and unfixable without per-alt-line odds.

| player | stat | pick line | best odds line | delta |
|--------|------|-----------|----------------|-------|
| Paolo Banchero | points | 22.5 | 21.5 | 1.0 |
| Paolo Banchero | points | 35.5 | 21.5 | 14.0 |
| Desmond Bane | points | 29.5 | 20.5 | 9.0 |
| Cade Cunningham | points | 42.5 | 27.5 | 15.0 |
| Desmond Bane | assists | 4.5 | 3.5 | 1.0 |
| Cade Cunningham | assists | 10.5 | 9.5 | 1.0 |
| Desmond Bane | points | 7.5 | 20.5 | 13.0 |
| Paolo Banchero | points | 13.5 | 21.5 | 8.0 |
| Cade Cunningham | points | 15.5 | 27.5 | 12.0 |
| Desmond Bane | points | 25.5 | 20.5 | 5.0 |
| Cade Cunningham | points | 32.5 | 27.5 | 5.0 |
| Paolo Banchero | points | 29.5 | 21.5 | 8.0 |
| Cade Cunningham | points | 36.5 | 27.5 | 9.0 |
| Paolo Banchero | points | 27.5 | 21.5 | 6.0 |
| Desmond Bane | points | 25.5 | 20.5 | 5.0 |
| Cade Cunningham | points | 5.5 | 27.5 | 22.0 |
| Desmond Bane | points | 4.5 | 20.5 | 16.0 |
| Paolo Banchero | points | 5.5 | 21.5 | 16.0 |
| Cade Cunningham | points | 10.5 | 27.5 | 17.0 |
| Cade Cunningham | points | 53.65 | 27.5 | 26.1 |
| ... and 448 more | | | |

## SGO quota log

Last 10 SGO API calls (from `quota_log.txt`):

```
2026-03-01T00:03:31.601Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=636 | includeAltLines=true
2026-03-01T04:26:42.731Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=664 | includeAltLines=true
2026-03-01T04:54:47.913Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=706 | includeAltLines=true
2026-03-01T11:00:26.329Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=824 | includeAltLines=true
2026-03-01T11:00:31.846Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=824 | includeAltLines=true
2026-03-01T12:56:58.672Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=843 | includeAltLines=true
2026-03-01T13:43:54.362Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=959 | includeAltLines=true
2026-03-01T16:05:52.868Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=954 | includeAltLines=true
2026-03-01T18:13:59.922Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=1011 | includeAltLines=true
2026-03-01T21:10:22.733Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=878 | includeAltLines=true
```

## Juice failures

Line matched but odds were too steep (worse than -250 implied probability). These are correctly filtered — the edge is not real.

| Stat | Count |
|------|-------|
| steals | 6 |

> **Note:** rebounds and assists for role players are often heavily juiced. This is expected behavior, not a data issue.
