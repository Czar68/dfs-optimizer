#!/usr/bin/env python3
"""
Settle card outcomes in the results DB using ESPN NBA box scores.

1. Load pending cards (optionally by date).
2. Load legs for those cards; derive game date from game_time or card created_at.
3. Fetch actual stats from ESPN per game date (NBA only).
4. For each leg: compare actual vs line/side → hit/miss/push; insert outcome.
5. When all legs of a card have outcomes, set card status (won/lost/partial) and settled_at.

Usage:
    python scripts/settle_results.py --date 2026-03-06   # settle cards with legs on this date
    python scripts/settle_results.py --all-pending       # settle all pending (all dates)
    python scripts/settle_results.py --dry-run            # show what would be settled, no DB write
"""

import argparse
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

_scripts_dir = Path(__file__).resolve().parent
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))
DB_PATH = _scripts_dir.parent / "results" / "results.db"

# Import ESPN fetcher from same scripts dir
try:
    from espn_boxscore import (
        fetch_all_player_stats_for_date,
        find_player_stats,
        get_stat_value_from_box,
    )
except ImportError:
    fetch_all_player_stats_for_date = None
    find_player_stats = None
    get_stat_value_from_box = None


def get_pending_cards(conn, date_filter=None):
    """Return list of (card_id, site, sport, flex_type, leg_count, kelly_stake, created_at)."""
    query = """SELECT card_id, site, sport, flex_type, leg_count, kelly_stake, created_at
               FROM cards WHERE status = 'pending'"""
    params = []
    if date_filter:
        query += " AND created_at LIKE ?"
        params.append(f"{date_filter}%")
    query += " ORDER BY created_at DESC"
    return conn.execute(query, params).fetchall()


def get_legs_for_cards(conn, card_ids):
    """Return list of (card_id, leg_id, leg_index, player, stat_type, line, side, game_time)."""
    if not card_ids:
        return []
    placeholders = ",".join("?" * len(card_ids))
    return conn.execute(
        f"""SELECT card_id, leg_id, leg_index, player, stat_type, line, side, game_time
            FROM legs WHERE card_id IN ({placeholders})
            ORDER BY card_id, leg_index""",
        list(card_ids),
    ).fetchall()


def existing_outcomes_for_card(conn, card_id):
    """Return set of leg_ids that already have an outcome for this card."""
    rows = conn.execute(
        "SELECT leg_id FROM outcomes WHERE card_id = ? AND result IN ('hit','miss','push')",
        (card_id,),
    ).fetchall()
    return {r[0] for r in rows}


def game_date_from_leg(game_time: str | None, card_created_at: str | None) -> str | None:
    """Extract YYYY-MM-DD from game_time or card created_at."""
    if game_time and len(game_time) >= 10:
        return game_time[:10]
    if card_created_at and len(card_created_at) >= 10:
        return card_created_at[:10]
    return None


def result_for_leg(actual: float, line: float, side: str) -> str:
    """Return 'hit', 'miss', or 'push'."""
    try:
        line_f = float(line)
    except (TypeError, ValueError):
        line_f = 0.0
    side = (side or "over").lower()
    if actual > line_f:
        return "hit" if side == "over" else "miss"
    if actual < line_f:
        return "miss" if side == "over" else "hit"
    return "push"


def settle(conn, dry_run: bool = False, date_filter: str | None = None):
    if fetch_all_player_stats_for_date is None:
        print("  ERROR: espn_boxscore module not found. Run from repo root: python scripts/settle_results.py ...")
        return

    pending = get_pending_cards(conn, date_filter)
    if not pending:
        print("  No pending cards to settle.")
        return

    card_ids = [r[0] for r in pending]
    legs = get_legs_for_cards(conn, card_ids)
    # Group legs by game date (we need stats per date)
    dates_needed = set()
    leg_rows_by_date = {}
    for row in legs:
        card_id, leg_id, leg_index, player, stat_type, line, side, game_time = row
        card_created = next((r[6] for r in pending if r[0] == card_id), None)
        d = game_date_from_leg(game_time, card_created)
        if d:
            dates_needed.add(d)
            leg_rows_by_date.setdefault(d, []).append(row)

    if not dates_needed:
        print("  No game dates found in legs (missing game_time / created_at).")
        return

    print(f"  Fetching ESPN box scores for {len(dates_needed)} date(s): {sorted(dates_needed)}")
    date_stats = {}
    for d in sorted(dates_needed):
        date_stats[d] = fetch_all_player_stats_for_date(d)
        n = len(date_stats[d])
        print(f"    {d}: {n} players")

    cur = conn.cursor()
    outcomes_inserted = 0
    cards_updated = 0
    settled_at = datetime.utcnow().isoformat() + "Z"

    for card_id, site, sport, flex_type, leg_count, kelly_stake, created_at in pending:
        existing = existing_outcomes_for_card(conn, card_id)
        card_legs = [r for r in legs if r[0] == card_id]
        new_outcomes = []

        for row in card_legs:
            card_id, leg_id, leg_index, player, stat_type, line, side, game_time = row
            if leg_id in existing:
                continue
            d = game_date_from_leg(game_time, created_at)
            if not d or sport != "NBA":
                continue
            stats_map = date_stats.get(d, {})
            player_stats = find_player_stats(stats_map, player or "")
            if player_stats is None:
                continue
            actual = get_stat_value_from_box(player_stats, stat_type or "")
            result = result_for_leg(actual, line, side or "over")
            new_outcomes.append((card_id, leg_id, result, actual, settled_at))
            if not dry_run:
                cur.execute(
                    """INSERT OR REPLACE INTO outcomes (card_id, leg_id, result, actual_stat, settled_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (card_id, leg_id, result, actual, settled_at),
                )
                outcomes_inserted += 1
            else:
                print(f"      [dry-run] {card_id[:8]}.. {leg_id} {player} {stat_type} {actual} vs {line} -> {result}")

        # If we now have outcomes for every leg, update card status
        new_result_by_leg = {oc[1]: oc[2] for oc in new_outcomes}
        total_outcomes = len(existing) + len(new_result_by_leg)
        if total_outcomes >= leg_count and leg_count > 0:
            all_results = []
            for r in card_legs:
                lid = r[1]
                if lid in new_result_by_leg:
                    all_results.append(new_result_by_leg[lid])
                elif lid in existing:
                    row = cur.execute("SELECT result FROM outcomes WHERE card_id = ? AND leg_id = ?", (card_id, lid)).fetchone()
                    if row:
                        all_results.append(row[0])
            if len(all_results) >= leg_count:
                hits = sum(1 for x in all_results if x == "hit")
                if hits == leg_count:
                    status = "won"
                elif any(x == "miss" for x in all_results):
                    status = "lost" if "F" not in flex_type else "partial"  # flex can have partial
                else:
                    status = "partial"
                if not dry_run:
                    cur.execute(
                        "UPDATE cards SET status = ?, settled_at = ? WHERE card_id = ?",
                        (status, settled_at, card_id),
                    )
                    cards_updated += 1
                else:
                    print(f"      [dry-run] card {card_id[:8]}.. -> {status}")

    if not dry_run:
        conn.commit()
    print(f"  Outcomes inserted: {outcomes_inserted}  Cards updated: {cards_updated}")


def main():
    parser = argparse.ArgumentParser(description="Settle card outcomes using ESPN NBA box scores")
    parser.add_argument("--date", type=str, help="Settle cards from this date (YYYY-MM-DD) by created_at")
    parser.add_argument("--all-pending", action="store_true", help="Settle all pending cards")
    parser.add_argument("--dry-run", action="store_true", help="Do not write to DB")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"DB not found: {DB_PATH}")
        print("Run export_results.py first.")
        return

    conn = sqlite3.connect(str(DB_PATH))
    date_filter = args.date if not args.all_pending else None
    if not args.all_pending and not args.date:
        # Default: settle cards created today
        date_filter = datetime.now().strftime("%Y-%m-%d")
        print(f"  No --date or --all-pending; using today: {date_filter}")

    print("=== Settle Results ===")
    try:
        settle(conn, dry_run=args.dry_run, date_filter=date_filter)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
