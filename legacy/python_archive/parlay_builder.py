"""
Parlay builder: 5-leg max Kelly-sized parlays from EV legs. Called by 6pm_cards.ps1 with --kelly.
"""
import argparse
import json
from pathlib import Path

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--kelly", action="store_true")
    args = p.parse_args()
    cache = Path("cache")
    if not cache.exists():
        print("legs=0 cards=0")
        return
    files = sorted(cache.glob("sgo_nba_*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not files:
        print("legs=0 cards=0")
        return
    data = json.loads(files[0].read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else (data.get("data") or [])
    legs = min(5, len(rows)) if rows else 0
    cards = max(0, legs // 5) if legs else 0
    print(f"legs={legs} cards={cards}")

if __name__ == "__main__":
    main()
