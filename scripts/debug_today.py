#!/usr/bin/env python3
"""
Count props by type/book/platform for a given date.
Usage: python scripts/debug_today.py [YYYYMMDD]
  Default date = today (local). Checks cache/ and artifacts/.
"""
import json
import sys
from pathlib import Path
from collections import defaultdict

def main():
    root = Path(__file__).resolve().parent.parent
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    if date_arg:
        ymd = date_arg  # YYYYMMDD
    else:
        from datetime import date
        ymd = date.today().strftime("%Y%m%d")

    cache_dir = root / "cache"
    artifacts_dir = root / "artifacts"

    print(f"=== Debug date: {ymd} ===\n")

    # ---- SGO: cache/sgo_nba_*.json and cache/nba_sgo_props_cache.json ----
    sgo_dated = list(cache_dir.glob(f"sgo_nba_{ymd}*.json")) if cache_dir.exists() else []
    sgo_props_cache = cache_dir / "nba_sgo_props_cache.json"

    print("--- SGO ---")
    if sgo_dated:
        for f in sgo_dated[:3]:
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                events = data.get("data") or data.get("props") or []
                if isinstance(events, dict):
                    events = list(events.values()) if isinstance(next(iter(events.values()), None), dict) else []
                points_count = rebounds_count = assists_count = 0
                player_odds = 0
                for ev in (events if isinstance(events, list) else []):
                    odds = (ev.get("odds") or {}) if isinstance(ev, dict) else {}
                    for odd_id, odd in (odds.items() if isinstance(odds, dict) else []):
                        if not isinstance(odd, dict):
                            continue
                        eid = odd.get("statEntityID") or ""
                        if eid in ("all", "home", "away"):
                            continue
                        player_odds += 1
                        stat = (odd.get("statID") or "").lower()
                        if "points" in stat:
                            points_count += 1
                        elif "rebound" in stat:
                            rebounds_count += 1
                        elif "assist" in stat:
                            assists_count += 1
                print(f"  {f.name}: events={len(events) if isinstance(events, list) else 0}, player odds={player_odds}, points={points_count}, rebounds={rebounds_count}, assists={assists_count}")
            except Exception as e:
                print(f"  {f.name}: error {e}")
    else:
        print(f"  No cache/sgo_nba_{ymd}*.json found.")

    if sgo_props_cache.exists():
        try:
            c = json.loads(sgo_props_cache.read_text(encoding="utf-8"))
            rows = c.get("data") or []
            by_stat = defaultdict(int)
            for r in rows:
                by_stat[r.get("stat") or "?"] += 1
            print(f"  nba_sgo_props_cache.json: totalRows={c.get('totalRows', len(rows))}, by stat: {dict(by_stat)}, fetchedAt={c.get('fetchedAt', '?')}")
        except Exception as e:
            print(f"  nba_sgo_props_cache.json: error {e}")
    else:
        print("  nba_sgo_props_cache.json: not found.")

    # ---- Underdog / PrizePicks: imported CSVs and cards ----
    print("\n--- Underdog / PrizePicks ---")
    ud_imported = root / "underdog_imported.csv"
    pp_imported = root / "prizepicks_imported.csv"
    ud_cards = root / "underdog-cards.csv"
    pp_cards = root / "prizepicks-cards.csv"
    for label, p in [("underdog_imported.csv", ud_imported), ("prizepicks_imported.csv", pp_imported)]:
        if p.exists():
            lines = p.read_text(encoding="utf-8", errors="replace").strip().splitlines()
            print(f"  {label}: {max(0, len(lines) - 1)} rows (excl. header)")
        else:
            print(f"  {label}: not found")
    for label, p in [("underdog-cards.csv", ud_cards), ("prizepicks-cards.csv", pp_cards)]:
        if p.exists():
            lines = p.read_text(encoding="utf-8", errors="replace").strip().splitlines()
            print(f"  {label}: {max(0, len(lines) - 1)} cards")
        else:
            print(f"  {label}: not found")

    # ---- Artifacts: logs for date ----
    print("\n--- Artifacts (logs) ---")
    if artifacts_dir.exists():
        logs = list(artifacts_dir.glob("logs/run_*.txt")) + list(artifacts_dir.glob("logs/run_*.failed.txt"))
        by_date = [f for f in logs if ymd in f.name]
        for f in sorted(by_date, key=lambda x: x.stat().st_mtime, reverse=True)[:5]:
            print(f"  {f.relative_to(root)}")
        if not by_date:
            print(f"  No artifacts/logs/run_*{ymd}* found.")
    else:
        print("  artifacts/ not found.")

    # ---- Merge reports (filter rejects) ----
    merge_ud = root / "merge_report_underdog.csv"
    merge_pp = root / "merge_report_prizepicks.csv"
    print("\n--- Merge reports (sample) ---")
    for label, p in [("merge_report_underdog.csv", merge_ud), ("merge_report_prizepicks.csv", merge_pp)]:
        if p.exists():
            lines = p.read_text(encoding="utf-8", errors="replace").strip().splitlines()
            print(f"  {label}: {max(0, len(lines) - 1)} rows")
        else:
            print(f"  {label}: not found")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
