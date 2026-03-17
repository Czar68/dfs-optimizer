#!/usr/bin/env python3
"""
Export today's cards to results DB (SQLite) + dated CSV archive.

Usage:
    python scripts/export_results.py            # export from root CSVs
    python scripts/export_results.py --dry-run  # preview without writing DB
"""

import argparse, csv, hashlib, json, os, sqlite3, uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT / "results"
SCHEMA_PATH = RESULTS_DIR / "schema.sql"
DB_PATH = RESULTS_DIR / "results.db"
MANIFEST_PATH = ROOT / "artifacts" / "last_fresh_run.json"

PP_CARDS = ROOT / "prizepicks-cards.csv"
UD_CARDS = ROOT / "underdog-cards.csv"
PP_LEGS = ROOT / "prizepicks-legs.csv"
UD_LEGS = ROOT / "underdog-legs.csv"

LEG_KEYS = [f"leg{i}Id" for i in range(1, 9)]


def card_id_hash(site, flex_type, leg_ids):
    sorted_ids = sorted(lid for lid in leg_ids if lid)
    raw = f"{site}-{flex_type}-{','.join(sorted_ids)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def sf(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def load_legs_lookup():
    lookup = {}
    for csv_path in [PP_LEGS, UD_LEGS]:
        if not csv_path.exists():
            continue
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                lid = (row.get("id") or "").strip()
                if not lid:
                    continue
                lookup[lid] = row
    return lookup


def load_cards():
    cards = []
    for csv_path, site_default in [(PP_CARDS, "PP"), (UD_CARDS, "UD")]:
        if not csv_path.exists():
            print(f"  WARNING: {csv_path} not found")
            continue
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if not any(row.values()):
                    continue
                site = (row.get("site") or site_default).strip().upper()
                flex_type = row.get("flexType", "")
                leg_ids = [(row.get(k) or "").strip() for k in LEG_KEYS]
                leg_ids = [lid for lid in leg_ids if lid]
                cid = card_id_hash(site, flex_type, leg_ids)

                card_type = "flex" if "F" in flex_type else "power"
                tier = (row.get("bestBetTier") or "").strip()
                if tier == "core":
                    tier = "strong"

                cards.append({
                    "card_id": cid,
                    "site": site,
                    "sport": row.get("Sport") or row.get("sport") or "NBA",
                    "flex_type": flex_type,
                    "card_type": card_type,
                    "leg_count": len(leg_ids),
                    "created_at": row.get("runTimestamp", ""),
                    "card_ev": sf(row.get("cardEv")),
                    "edge_pct": sf(row.get("avgEdgePct")),
                    "win_prob_cash": sf(row.get("winProbCash")) or None,
                    "win_prob_any": sf(row.get("winProbAny")) or None,
                    "avg_prob": sf(row.get("avgProb")) or None,
                    "kelly_raw_frac": sf(row.get("kellyRawFraction")) or None,
                    "kelly_final_frac": sf(row.get("kellyFinalFraction") or row.get("kellyFrac")) or None,
                    "kelly_stake": sf(row.get("kellyStake")),
                    "kelly_risk_adj": row.get("kellyRiskAdjustment", ""),
                    "best_bet_score": sf(row.get("bestBetScore")) or None,
                    "best_bet_tier": tier or None,
                    "leg_ids": leg_ids,
                })
    return cards


def init_db():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()
    return conn


def export_run(conn, cards):
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8]
    manifest = {}
    if MANIFEST_PATH.exists():
        try:
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    pp_cards = sum(1 for c in cards if c["site"] == "PP")
    ud_cards = sum(1 for c in cards if c["site"] == "UD")
    sports = ",".join(sorted(set(c["sport"] for c in cards)))

    conn.execute(
        """INSERT OR IGNORE INTO runs
           (run_id, started_at, completed_at, bankroll, odds_source,
            pp_cards, ud_cards, sports)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (run_id,
         manifest.get("fresh_run_completed_at", datetime.now().isoformat()),
         datetime.now().isoformat(),
         manifest.get("bankroll", 600),
         "OddsAPI",
         pp_cards, ud_cards, sports),
    )
    conn.commit()
    return run_id


def export_to_db(cards, legs_lookup, conn, run_id):
    cur = conn.cursor()
    inserted_cards = 0
    inserted_legs = 0
    for card in cards:
        try:
            cur.execute(
                """INSERT OR IGNORE INTO cards
                   (card_id, run_id, site, sport, flex_type, card_type,
                    leg_count, created_at, card_ev, edge_pct,
                    win_prob_cash, win_prob_any, avg_prob,
                    kelly_raw_frac, kelly_final_frac, kelly_stake, kelly_risk_adj,
                    best_bet_score, best_bet_tier)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (card["card_id"], run_id, card["site"], card["sport"],
                 card["flex_type"], card["card_type"],
                 card["leg_count"], card["created_at"], card["card_ev"],
                 card["edge_pct"], card["win_prob_cash"], card["win_prob_any"],
                 card["avg_prob"], card["kelly_raw_frac"], card["kelly_final_frac"],
                 card["kelly_stake"], card["kelly_risk_adj"],
                 card["best_bet_score"], card["best_bet_tier"]),
            )
            if cur.rowcount > 0:
                inserted_cards += 1
        except sqlite3.IntegrityError:
            pass

        for idx, lid in enumerate(card["leg_ids"]):
            leg = legs_lookup.get(lid, {})
            try:
                cur.execute(
                    """INSERT OR IGNORE INTO legs
                       (leg_id, card_id, leg_index, player, team,
                        stat_type, line, side, true_prob, edge, leg_ev,
                        over_odds, under_odds, book, game_time)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (lid, card["card_id"], idx,
                     leg.get("player", ""),
                     leg.get("team", ""),
                     leg.get("stat", ""),
                     sf(leg.get("line", "")),
                     "over",
                     sf(leg.get("trueProb")) or None,
                     sf(leg.get("edge")) or None,
                     sf(leg.get("legEv")) or None,
                     sf(leg.get("overOdds")) or None,
                     sf(leg.get("underOdds")) or None,
                     leg.get("book", ""),
                     leg.get("gameTime", "")),
                )
                if cur.rowcount > 0:
                    inserted_legs += 1
            except sqlite3.IntegrityError:
                pass

    conn.commit()
    return inserted_cards, inserted_legs


def export_dated_csv(cards, date_str):
    out_path = RESULTS_DIR / f"cards_{date_str}.csv"
    headers = [
        "card_id", "site", "sport", "flex_type", "card_type", "leg_count",
        "created_at", "card_ev", "edge_pct", "win_prob_cash", "win_prob_any",
        "avg_prob", "kelly_stake", "best_bet_score", "best_bet_tier",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        for card in cards:
            w.writerow(card)
    return out_path, len(cards)


def main():
    parser = argparse.ArgumentParser(description="Export today's cards to results DB")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"=== Export Results — {date_str} ===")

    legs_lookup = load_legs_lookup()
    print(f"  Legs lookup: {len(legs_lookup)} entries")

    cards = load_cards()
    print(f"  Cards loaded: {len(cards)}")
    if not cards:
        print("  No cards to export.")
        return

    csv_path, csv_count = export_dated_csv(cards, date_str)
    print(f"  CSV archive: {csv_path} ({csv_count} rows)")

    if args.dry_run:
        print("  Dry run — skipping DB write.")
        return

    conn = init_db()
    run_id = export_run(conn, cards)
    print(f"  Run ID: {run_id}")

    inserted_cards, inserted_legs = export_to_db(cards, legs_lookup, conn, run_id)
    conn.close()
    print(f"  DB: {inserted_cards} new cards, {inserted_legs} new legs -> {DB_PATH}")

    total_db = sqlite3.connect(str(DB_PATH))
    total_cards = total_db.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    total_runs = total_db.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
    total_db.close()
    print(f"  Total: {total_cards} cards across {total_runs} runs")
    print("  DONE")


if __name__ == "__main__":
    main()
