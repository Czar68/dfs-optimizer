# Merge audit report

Generated: 2026-03-03T23:00:55.425Z

> **Underdog focus:** 278/1033 picks matched (26.9%); dominant failure = **line_diff (598 of 755)**.

## Underdog failure breakdown

Where Underdog picks are failing the merge (use this to fix aliases, stat mapping, or line tolerance):

| Metric | Count | % of total |
|--------|-------|------------|
| Total Underdog picks | 1033 | 100% |
| Matched | 278 | 26.9% |
| No candidate (name/stat not in odds) | 145 | 14.0% |
| Line diff > 1 | 598 | 57.9% |
| Juice too extreme | 12 | 1.2% |

**Where Underdog fails most:** `line_diff` (598 of 755 unmatched).

### Top stat types driving no_candidate failures

| Stat | no_candidate count |
|------|---------------------|
| points | 57 ← likely absent players |
| assists | 40 |
| rebounds | 24 |
| steals | 19 ← not in odds feed (pre-filtered in v2+) |
| blocks | 5 ← not in odds feed (pre-filtered in v2+) |

### Players with 0% match rate (all props = no_candidate)

These players have no odds coverage in SGO/TheRundown. No alias fix can help — they simply have no odds data.

- Keon Ellis
- Craig Porter Jr.
- PJ Washington
- Josh Green
- Dwight Powell
- Ryan Kalkbrenner
- Julian Reese
- Karl-Anthony Towns
- Ja'Kobe Walter
- Danny Wolf
- De'Aaron Fox
- Lu Dort
- Herb Jones
- Royce O'Neale
- Daeqwon Plowden

### Stat merge matrix

| Stat | Total | Matched | Match% | no_candidate | line_diff | juice |
|------|-------|---------|--------|--------------|-----------|-------|
| points | 711 | 90 | 13% | 57 | 564 | 0 |
| rebounds | 143 | 98 | 69% | 24 | 21 | 0 |
| assists | 127 | 75 | 59% | 40 | 10 | 2 |
| steals | 40 | 10 | 25% | 19 | 2 | 9 |
| blocks | 12 | 5 | 42% | 5 | 1 | 1 |

> **Guide:** `no_candidate` = player/stat not in odds feed; `line_diff` = Underdog alt lines (unfixable); `juice` = steep chalk (REB/AST expected).

## By site

| Site | Total | Matched | no_candidate | line_diff | juice |
|-----|-------|---------|--------------|-----------|-------|
| underdog | 1033 | 278 | 145 | 598 | 12 |
| prizepicks | 808 | 473 | 231 | 103 | 1 |

## Summary

| Metric | Count |
|--------|-------|
| Total picks | 1841 |
| Matched | 751 |
| No candidate (name/stat missing in odds) | 376 |
| Line diff > 1 | 701 |
| Juice too extreme | 13 |

## Suggested aliases

Add these to `PLAYER_NAME_ALIASES` in `src/merge_odds.ts` if the mapping is correct (same player, different spelling):

- `"karl-anthony towns": "tyrese maxey"`

## Line-diff sample

Name matched but odds line differed by more than 1.
- **393** are alternate prop lines far from the main odds line (delta > 5) — expected and unfixable without per-alt-line odds.

| player | stat | pick line | best odds line | delta |
|--------|------|-----------|----------------|-------|
| James Harden | points | 21.5 | 20.5 | 1.0 |
| James Harden | points | 34.5 | 20.5 | 14.0 |
| Cade Cunningham | points | 41.5 | 25.5 | 16.0 |
| James Harden | points | 12.5 | 20.5 | 8.0 |
| Cade Cunningham | points | 16.5 | 25.5 | 9.0 |
| James Harden | points | 26.5 | 20.5 | 6.0 |
| Cade Cunningham | points | 31.5 | 25.5 | 6.0 |
| James Harden | points | 29.5 | 20.5 | 9.0 |
| Cade Cunningham | points | 35.5 | 25.5 | 10.0 |
| Cade Cunningham | points | 6.5 | 25.5 | 19.0 |
| James Harden | points | 5.5 | 20.5 | 15.0 |
| James Harden | points | 8.5 | 20.5 | 12.0 |
| Cade Cunningham | points | 9.5 | 25.5 | 16.0 |
| James Harden | points | 39.85 | 20.5 | 19.4 |
| Cade Cunningham | points | 52.55 | 25.5 | 27.0 |
| James Harden | points | 9.5 | 20.5 | 11.0 |
| Cade Cunningham | points | 11.5 | 25.5 | 14.0 |
| Cade Cunningham | points | 4.5 | 25.5 | 21.0 |
| James Harden | points | 16.5 | 20.5 | 4.0 |
| Cade Cunningham | points | 20.5 | 25.5 | 5.0 |
| ... and 681 more | | | |

## SGO quota log

Last 10 SGO API calls (from `quota_log.txt`):

```
2026-03-03T03:00:21.204Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=464 | includeAltLines=true
2026-03-03T03:00:41.768Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=464 | includeAltLines=true
2026-03-03T11:00:27.090Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=623 | includeAltLines=true
2026-03-03T11:00:35.395Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=623 | includeAltLines=true
2026-03-03T17:01:28.738Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=849 | includeAltLines=true
2026-03-03T17:01:35.734Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=849 | includeAltLines=true
2026-03-03T21:18:29.235Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=912 | includeAltLines=true
2026-03-03T21:18:57.324Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=912 | includeAltLines=true
2026-03-03T21:21:31.817Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=913 | includeAltLines=true
2026-03-03T21:42:02.156Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=911 | includeAltLines=true
```

## Juice failures

Line matched but odds were too steep (worse than -250 implied probability). These are correctly filtered — the edge is not real.

| Stat | Count |
|------|-------|
| steals | 9 |
| assists | 2 |
| blocks | 1 |

> **Note:** rebounds and assists for role players are often heavily juiced. This is expected behavior, not a data issue.
