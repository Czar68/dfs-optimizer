#!/usr/bin/env python3
"""
Count props by type/book/platform for a given date.
Usage: python scripts/debug_today.py [YYYYMMDD]
  Default date = today (local). Checks cache/ and artifacts/.
"""
import json
import sys
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent.parent
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    if date_arg:
        ymd = date_arg  # YYYYMMDD
    else:
        from datetime import date
        ymd = date.today().strftime("%Y%m%d")

    artifacts_dir = root / "artifacts"

    print(f"=== Debug date: {ymd} ===\n")

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
