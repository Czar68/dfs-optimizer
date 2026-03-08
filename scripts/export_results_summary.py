#!/usr/bin/env python3
"""
Query results.db for parlay/leg aggregates and write results_summary.json
for the dashboard (5 boxes: Day/Week/Month/LT/Past + Top 100 legs).

Usage:
    python scripts/export_results_summary.py
    # Writes web-dashboard/public/data/results_summary.json
"""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "results" / "results.db"
OUT_PATH = ROOT / "web-dashboard" / "public" / "data" / "results_summary.json"


def get_conn():
    if not DB_PATH.exists():
        return None
    return sqlite3.connect(str(DB_PATH))


def parlay_stats(conn, since_sql: str | None) -> tuple[int, int]:
    """Return (wins, total) for settled parlays. since_sql = SQL fragment e.g. AND cs.settled_ts >= date('now','-7 days'), or None for all-time."""
    where = f" AND cs.settled_ts IS NOT NULL {since_sql}" if since_sql else " AND cs.settled_ts IS NOT NULL"
    q = f"""
    WITH card_outcomes AS (
        SELECT o.card_id,
               SUM(CASE WHEN o.result = 'hit' THEN 1 ELSE 0 END) AS hits,
               COUNT(*) AS outcome_count,
               MAX(o.settled_at) AS outcome_settled
        FROM outcomes o
        WHERE o.result IN ('hit','miss','push','void')
        GROUP BY o.card_id
    ),
    cards_settled AS (
        SELECT c.card_id, c.leg_count,
               COALESCE(c.settled_at, co.outcome_settled) AS settled_ts
        FROM cards c
        INNER JOIN card_outcomes co ON c.card_id = co.card_id AND co.outcome_count = c.leg_count
    )
    SELECT
        SUM(CASE WHEN co.hits = cs.leg_count THEN 1 ELSE 0 END) AS wins,
        COUNT(*) AS total
    FROM cards_settled cs
    INNER JOIN card_outcomes co ON co.card_id = cs.card_id AND co.outcome_count = cs.leg_count
    WHERE 1=1 {where}
    """
    try:
        row = conn.execute(q).fetchone()
        return (row[0] or 0, row[1] or 0)
    except sqlite3.OperationalError:
        return (0, 0)


def top100_legs(conn) -> list[dict]:
    """Top 100 legs by hit rate (lifetime): player, prop, line, hits, attempts, hit_pct, ev."""
    q = """
    SELECT
        l.player,
        l.stat_type AS prop,
        l.line,
        SUM(CASE WHEN o.result = 'hit' THEN 1 ELSE 0 END) AS hits,
        COUNT(*) AS attempts,
        AVG(l.leg_ev) AS ev
    FROM legs l
    INNER JOIN outcomes o ON l.card_id = o.card_id AND l.leg_id = o.leg_id
    WHERE o.result IN ('hit','miss','push')
      AND l.player IS NOT NULL AND l.player != ''
    GROUP BY l.player, l.stat_type, l.line
    HAVING attempts >= 1
    ORDER BY 1.0 * SUM(CASE WHEN o.result = 'hit' THEN 1 ELSE 0 END) / COUNT(*) DESC
    LIMIT 100
    """
    try:
        rows = conn.execute(q).fetchall()
        return [
            {
                "player": r[0] or "",
                "prop": r[1] or "",
                "line": r[2],
                "hits": r[3],
                "attempts": r[4],
                "hitPct": round((r[3] / r[4]) * 100, 1) if r[4] else 0,
                "ev": round(r[5], 4) if r[5] is not None else None,
            }
            for r in rows
        ]
    except sqlite3.OperationalError:
        return []


def leg_stats(conn) -> dict[str, dict]:
    """Per leg_id: last (1=hit/0=miss), last10 [hits, att], last20 [hits, att], season [hits, att]. Key = leg_id."""
    q = """
    SELECT leg_id, result, settled_at
    FROM outcomes
    WHERE result IN ('hit','miss','push') AND leg_id IS NOT NULL AND leg_id != '__card__' AND settled_at IS NOT NULL
    ORDER BY leg_id, settled_at DESC
    """
    try:
        rows = conn.execute(q).fetchall()
    except sqlite3.OperationalError:
        return {}

    out: dict[str, dict] = {}
    by_leg: dict[str, list[int]] = {}  # leg_id -> list of 1/0 (hit/miss) most recent first
    for leg_id, result, _ in rows:
        by_leg.setdefault(leg_id, []).append(1 if result == "hit" else 0)

    for leg_id, arr in by_leg.items():
        last = arr[0] if arr else None
        last10 = (sum(arr[:10]), min(10, len(arr))) if arr else None
        last20 = (sum(arr[:20]), min(20, len(arr))) if arr else None
        season = (sum(arr), len(arr)) if arr else None
        out[leg_id] = {}
        if last is not None:
            out[leg_id]["last"] = last
        if last10:
            out[leg_id]["last10"] = list(last10)
        if last20:
            out[leg_id]["last20"] = list(last20)
        if season:
            out[leg_id]["season"] = list(season)
    return out


def main():
    conn = get_conn()
    if not conn:
        summary = {
            "day": {"hits": 0, "total": 0},
            "week": {"hits": 0, "total": 0},
            "month": {"hits": 0, "total": 0},
            "lt": {"hits": 0, "total": 0},
            "past": {"hits": 0, "total": 0},
            "top100": [],
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"  No {DB_PATH} — wrote empty summary to {OUT_PATH}")
        return

    try:
        day_w, day_t = parlay_stats(conn, " AND cs.settled_ts >= date('now','start of day') AND cs.settled_ts < date('now','start of day','+1 day')")
        week_w, week_t = parlay_stats(conn, " AND cs.settled_ts >= date('now','-7 days')")
        month_w, month_t = parlay_stats(conn, " AND cs.settled_ts >= date('now','-30 days')")
        lt_w, lt_t = parlay_stats(conn, None)
        past_w, past_t = parlay_stats(conn, " AND cs.settled_ts >= date('now','-7 days')")
        top100 = top100_legs(conn)
        leg_stats_map = leg_stats(conn)

        summary = {
            "day": {"hits": day_w, "total": day_t},
            "week": {"hits": week_w, "total": week_t},
            "month": {"hits": month_w, "total": month_t},
            "lt": {"hits": lt_w, "total": lt_t},
            "past": {"hits": past_w, "total": past_t},
            "top100": top100,
            "legStats": leg_stats_map,
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"  results_summary.json: Day {day_w}/{day_t} | Week {week_w}/{week_t} | LT {lt_w}/{lt_t} | top100={len(top100)} | legStats={len(leg_stats_map)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
