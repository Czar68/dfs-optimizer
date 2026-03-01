# Why 0 Points Props / 0 Underdog Cards Yesterday (20260225)

## 1. Points props in SGO yesterday?

**Yes.** SGO had plenty of points (and rebounds/assists) props:

- **cache/sgo_nba_20260225_2106.json** (daily_data.ps1 v2/events):  
  `events=10`, **player odds=6,142** (points=1,680, rebounds=820, assists=522).
- **cache/nba_sgo_props_cache.json** (used by optimizer merge):  
  `totalRows=666`, by stat: points=111, rebounds=109, assists=82, threes=86, combos (PR, PA, RA)=278.  
  *(This file can be from a later run; optimizer reads it for merge.)*

So SGO was not the bottleneck for “0 points props” in the pipeline.

---

## 2. Underdog markets?

**Yes.** Underdog had markets and they were merged:

- **Raw:** 1,103 NBA props from Underdog API.
- **Merge:** 200 merged with SGO odds (points=70, rebounds=73, assists=57).
- **Filter:** `filterEvPicks` left **13 legs**, with **adj-EV range -2.4% to -0.1%** (all negative or near zero).
- **Cards:**  
  *"0 cards from 13 legs — all combos rejected by structure EV thresholds."*  
  So 0 Underdog cards because no card combo met the **min structure EV**; the log: *"Underdog has priced today's slate accurately — no exploitable edge found."*

Rejects were not from “no Underdog markets” but from **EV/structure thresholds** (discounted picks, low/negative edge).

---

## 3. Filter rejects (min_edge? volume?)

**PrizePicks (evening run 19:06):**

- Raw: 1,960 → merged: 174 (main=174, alt=0).
- Skipped: promo=1,658, fantasy=72; ud_skipped no_odds_stat=23; no match: no_candidate=15, line_diff=18, juice=0.
- Then: edge filter (≥1.5%) → 57; EV filter (≥2% raw, adjEV ≥3%) → 26; player cap (1 per player) → **24 legs**.
- Result: 474 PP cards.

**Underdog (same run):**

- Raw: 1,103 → merged: 200.
- ud_skipped: no_odds_stat=56, **escalator=303**, no match: no_candidate=68, **line_diff=474**, juice=2.
- 110 discounted (factor<1), 59 boosted; after `filterEvPicks`: **13 legs**, all with negative adj-EV.
- **0 cards** (all combos below structure EV thresholds).

So: **min_edge / volume / structure EV** are what removed or rejected legs and all UD card combos; not “no data” from SGO or Underdog.

---

## 4. Morning run failure (06:00) — 0 legs/cards from that run

- **artifacts/logs/run_20260225-060008.txt** stops right after SGO harvest (401 rows, 0 alt lines).  
- **artifacts/logs/run_20260225-060008.failed.txt** only says "Run failed".
- So the **06:00 run crashed** after SGO and never wrote merge/legs/cards. If you looked at “yesterday” output from that run, you’d see 0 legs and 0 cards for that run only.
- Likely failure point: right after SGO (e.g. during `writeRawCache` or the next merge step). Full stderr would confirm.

---

## 5. Best play 0-hit legs (last 3 days)

This needs **result/backtest** data (which legs were “best play” and whether they hit). There is no backtest or results tracker in this repo that records 0-hit legs by date. If you have a separate results DB or sheet, we can add a small script that reads it and lists last-3-days 0-hit best plays.

---

## 6. Debug script and commands

- **scripts/debug_today.py** added: run `python scripts/debug_today.py 20260225` (or any YYYYMMDD) to get counts by type/book/platform (SGO, PP/UD imports, cards, merge reports).
- SGO files for 20260225 live under **cache/** (e.g. `cache\sgo_nba_20260225_2106.json`), not `artifacts\`. Cards are written to project root: `prizepicks-cards.csv`, `underdog-cards.csv` (artifacts store logs and run reports only).

---

## Summary

| Question | Answer |
|----------|--------|
| Points props in SGO yesterday? | Yes (1,680 in raw sgo_nba file; 111 in props cache). |
| Underdog markets? | Yes (1,103 raw, 200 merged). |
| Why 0 UD cards? | 13 legs after filters, all with negative adj-EV; every card combo rejected by structure EV thresholds. |
| Why 0 from morning run? | 06:00 run failed after SGO harvest; no merge/legs/cards written. |
| Filter rejects? | PP: mostly promo/fantasy skip; UD: escalator, line_diff, no_candidate, then EV/structure thresholds. |
