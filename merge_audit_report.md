# Merge audit report

Generated: 2026-03-06T23:01:58.986Z

> **Underdog focus:** 215/833 picks matched (25.8%); dominant failure = **line_diff (477 of 618)**.

## Underdog failure breakdown

Where Underdog picks are failing the merge (use this to fix aliases, stat mapping, or line tolerance):

| Metric | Count | % of total |
|--------|-------|------------|
| Total Underdog picks | 833 | 100% |
| Matched | 215 | 25.8% |
| No candidate (name/stat not in odds) | 127 | 15.2% |
| Line diff > 1 | 477 | 57.3% |
| Juice too extreme | 14 | 1.7% |

**Where Underdog fails most:** `line_diff` (477 of 618 unmatched).

### Top stat types driving no_candidate failures

| Stat | no_candidate count |
|------|---------------------|
| points | 50 ← likely absent players |
| assists | 34 |
| rebounds | 31 |
| steals | 11 ← not in odds feed (pre-filtered in v2+) |
| blocks | 1 ← not in odds feed (pre-filtered in v2+) |

### Players with 0% match rate (all props = no_candidate)

These players have no odds coverage in SGO/TheRundown. No alias fix can help — they simply have no odds data.

- Cooper Flagg
- PJ Washington
- Dorian Finney-Smith
- Karl-Anthony Towns
- Cam Johnson
- Royce O'Neale
- Herb Jones
- De'Aaron Fox
- Luke Kornet
- Isaiah Jackson
- Kobe Sanders

### Stat merge matrix

| Stat | Total | Matched | Match% | no_candidate | line_diff | juice |
|------|-------|---------|--------|--------------|-----------|-------|
| points | 580 | 74 | 13% | 50 | 456 | 0 |
| rebounds | 112 | 71 | 63% | 31 | 10 | 0 |
| assists | 100 | 57 | 57% | 34 | 9 | 0 |
| steals | 32 | 10 | 31% | 11 | 1 | 10 |
| blocks | 9 | 3 | 33% | 1 | 1 | 4 |

> **Guide:** `no_candidate` = player/stat not in odds feed; `line_diff` = Underdog alt lines (unfixable); `juice` = steep chalk (REB/AST expected).

## By site

| Site | Total | Matched | no_candidate | line_diff | juice |
|-----|-------|---------|--------------|-----------|-------|
| underdog | 833 | 215 | 127 | 477 | 14 |
| prizepicks | 723 | 408 | 264 | 50 | 1 |

## Summary

| Metric | Count |
|--------|-------|
| Total picks | 1556 |
| Matched | 623 |
| No candidate (name/stat missing in odds) | 391 |
| Line diff > 1 | 527 |
| Juice too extreme | 15 |

## No-candidate picks (no alias suggested)

No single SGO row matched stat/sport/line for these. Compare `merge_report_underdog.csv` / `merge_report_prizepicks.csv` with `sgo_imported.csv` and add manual aliases in `src/merge_odds.ts`.

| player | stat | line | sport |
|--------|------|------|-------|
| Cooper Flagg | points | 17.5 | NBA |
| Cooper Flagg | points | 25.5 | NBA |
| Cooper Flagg | rebounds | 5.5 | NBA |
| Cooper Flagg | assists | 3.5 | NBA |
| Cooper Flagg | points | 8.5 | NBA |
| Cooper Flagg | points | 22.5 | NBA |
| Cooper Flagg | points | 20.5 | NBA |
| Cooper Flagg | points | 4.5 | NBA |
| Cooper Flagg | points | 6.5 | NBA |
| Cooper Flagg | points | 30.75 | NBA |
| Cooper Flagg | points | 15.5 | NBA |
| Klay Thompson | rebounds | 1.5 | NBA |
| Klay Thompson | assists | 1.5 | NBA |
| PJ Washington | points | 12.5 | NBA |
| PJ Washington | points | 20.5 | NBA |
| PJ Washington | rebounds | 6.5 | NBA |
| PJ Washington | assists | 1.5 | NBA |
| Dwight Powell | assists | 1.5 | NBA |
| Brandon Williams | rebounds | 2.5 | NBA |
| Brandon Williams | assists | 3.5 | NBA |
| Baylor Scheierman | assists | 1.5 | NBA |
| Coby White | rebounds | 2.5 | NBA |
| Brandon Miller | steals | 1.5 | NBA |
| Josh Green | rebounds | 2.5 | NBA |
| Grant Williams | points | 6.5 | NBA |
| Grant Williams | points | 11.5 | NBA |
| Grant Williams | assists | 1.5 | NBA |
| Kel'el Ware | steals | 1.5 | NBA |
| Kasparas Jakucionis | rebounds | 2.5 | NBA |
| Ryan Kalkbrenner | rebounds | 4.5 | NBA |
| ... and 361 more | | | |

## Line-diff sample

Name matched but odds line differed by more than 1.
- **331** are alternate prop lines far from the main odds line (delta > 5) — expected and unfixable without per-alt-line odds.

| player | stat | pick line | best odds line | delta |
|--------|------|-----------|----------------|-------|
| Jayson Tatum | points | 11.5 | 12.5 | 1.0 |
| Jayson Tatum | points | 19.5 | 12.5 | 7.0 |
| Jayson Tatum | rebounds | 4.5 | 3.5 | 1.0 |
| Jayson Tatum | points | 7.5 | 12.5 | 5.0 |
| Jayson Tatum | points | 3.5 | 12.5 | 9.0 |
| Jayson Tatum | points | 4.5 | 12.5 | 8.0 |
| Jaylen Brown | points | 26.5 | 27.5 | 1.0 |
| Jaylen Brown | points | 38.5 | 27.5 | 11.0 |
| Jaylen Brown | points | 11.5 | 27.5 | 16.0 |
| Jaylen Brown | points | 34.5 | 27.5 | 7.0 |
| Jaylen Brown | points | 31.5 | 27.5 | 4.0 |
| Jaylen Brown | points | 6.5 | 27.5 | 21.0 |
| Jaylen Brown | points | 11.5 | 27.5 | 16.0 |
| Jaylen Brown | points | 42.05 | 27.5 | 14.5 |
| Jaylen Brown | steals | 1.5 | 0.5 | 1.0 |
| Jaylen Brown | points | 4.5 | 27.5 | 23.0 |
| Jaylen Brown | points | 13.5 | 27.5 | 14.0 |
| Jaylen Brown | points | 20.5 | 27.5 | 7.0 |
| Jaylen Brown | points | 20.5 | 27.5 | 7.0 |
| Jaylen Brown | points | 5.5 | 27.5 | 22.0 |
| ... and 507 more | | | |

## SGO quota log

Last 10 SGO API calls (from `quota_log.txt`):

```
2026-03-05T23:01:14.999Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=831 | includeAltLines=true
2026-03-05T23:01:15.584Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=831 | includeAltLines=true
2026-03-06T03:00:41.674Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=532 | includeAltLines=true
2026-03-06T03:01:00.931Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=552 | includeAltLines=true
2026-03-06T11:01:34.405Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=506 | includeAltLines=true
2026-03-06T11:01:40.410Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=506 | includeAltLines=true
2026-03-06T17:01:39.937Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=616 | includeAltLines=true
2026-03-06T17:01:47.449Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=616 | includeAltLines=true
2026-03-06T18:17:26.793Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=626 | includeAltLines=true
2026-03-06T22:16:29.755Z | SGO HARVEST | league=NBA | call#=1/2500 | alts=0 | total_rows=655 | includeAltLines=true
```

## Juice failures

Line matched but odds were too steep (worse than -250 implied probability). These are correctly filtered — the edge is not real.

| Stat | Count |
|------|-------|
| steals | 10 |
| blocks | 4 |

> **Note:** rebounds and assists for role players are often heavily juiced. This is expected behavior, not a data issue.
