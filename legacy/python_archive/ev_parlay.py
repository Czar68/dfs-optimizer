"""
EV parlay: generate EV>1.05 legs from cache. Called by 2pm_models.ps1 with --generate.
"""
import argparse
import json
from pathlib import Path

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--generate", action="store_true")
    args = p.parse_args()
    cache = Path("cache")
    if not cache.exists():
        print("No cache/; run 9am_data / daily_data first.")
        return
    files = list(cache.glob("sgo_nba_*.json")) + list(cache.glob("sgo_opening_*.json"))
    if not files:
        print("No SGO cache files; run 9am_data / daily_data first.")
        return
    data = json.loads(files[-1].read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else (data.get("data") or data.get("props") or [])
    if not rows:
        rows = []
    ev_legs = [r for r in rows if isinstance(r, dict) and (r.get("ev") or 0) >= 0.05][:20]
    print("EV>1.05 legs: {} (sample from {} rows)".format(len(ev_legs), len(rows)))

if __name__ == "__main__":
    main()
