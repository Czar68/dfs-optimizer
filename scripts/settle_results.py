#!/usr/bin/env python3
"""
Stub: Settle card outcomes in the results DB.

Future implementation will:
1. Load pending cards from DB
2. Fetch actual stat lines from API (or manual CSV)
3. Compare final_stat vs line for each leg
4. Mark legs as hit/miss/push
5. Mark card as won/lost/partial
6. Calculate ROI

Usage:
    python scripts/settle_results.py --date 2026-03-06
    python scripts/settle_results.py --all-pending
"""

import argparse, sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "results" / "results.db"


def get_pending_cards(conn, date_filter=None):
    query = "SELECT card_id, site, sport, flex_type, leg_count, card_ev, kelly_stake, created_at FROM cards WHERE status = 'pending'"
    params = []
    if date_filter:
        query += " AND created_at LIKE ?"
        params.append(f"{date_filter}%")
    query += " ORDER BY created_at DESC"
    return conn.execute(query, params).fetchall()


def main():
    parser = argparse.ArgumentParser(description="Settle card outcomes (stub)")
    parser.add_argument("--date", type=str, help="Settle cards from this date (YYYY-MM-DD)")
    parser.add_argument("--all-pending", action="store_true", help="Settle all pending cards")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"DB not found: {DB_PATH}")
        print("Run export_results.py first.")
        return

    conn = sqlite3.connect(str(DB_PATH))
    date_filter = args.date if not args.all_pending else None
    pending = get_pending_cards(conn, date_filter)

    print(f"=== Settle Results ===")
    print(f"  Pending cards: {len(pending)}")

    if not pending:
        print("  Nothing to settle.")
        conn.close()
        return

    for row in pending[:10]:
        card_id, site, sport, flex_type, leg_count, card_ev, kelly, created = row
        print(f"  {card_id[:8]}.. {site} {flex_type} legs={leg_count} EV={card_ev:.3f} kelly=${kelly:.2f} @ {created}")

    if len(pending) > 10:
        print(f"  ... and {len(pending) - 10} more")

    print("\n  STUB: Settlement logic not yet implemented.")
    print("  TODO: Fetch actual stat lines and compare vs leg lines.")
    print("  TODO: Mark each leg as hit/miss, each card as won/lost/partial.")
    print("  TODO: Calculate ROI and update outcomes table.")

    conn.close()


if __name__ == "__main__":
    main()
