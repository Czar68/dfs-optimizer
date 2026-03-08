#!/usr/bin/env python3
"""
SGO NBA historical backfill: fetch finalized NBA events from SportsGameOdds v2 API,
output CSV (games or player props). API key from SGO_API_KEY env only (no placeholder).

Usage:
  Set SGO_API_KEY in env or pass from caller (e.g. PowerShell sets $env:SGO_API_KEY).
  python scripts/sgo_nba_historical.py --days 7 [--max-games 50] [--out cache/sgo_nba_games.csv]
"""

import argparse
import csv
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    requests = None

BASE_URL = "https://api.sportsgameodds.com/v2/events"


def get_api_key(args_api_key: str | None) -> str:
    """API key from env SGO_API_KEY or from args. No default/placeholder."""
    key = (args_api_key or os.environ.get("SGO_API_KEY") or os.environ.get("SGOAPIKEY") or "").strip()
    if not key or key.startswith("sk-your") or "your_real" in key.lower():
        print("ERROR: SGO_API_KEY not set or still placeholder. Set in .env or pass from caller.", file=sys.stderr)
        sys.exit(1)
    return key


def fetch_events(api_key: str, starts_after: str, starts_before: str, limit: int = 50) -> list[dict]:
    """Fetch finalized NBA events in date range."""
    if not requests:
        print("ERROR: pip install requests", file=sys.stderr)
        sys.exit(1)
    params = {
        "apiKey": api_key,
        "leagueID": "NBA",
        "sportID": "BASKETBALL",
        "finalized": "true",
        "startsAfter": starts_after,
        "startsBefore": starts_before,
        "limit": min(limit, 100),
    }
    out: list[dict] = []
    cursor = None
    while True:
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(BASE_URL, params=params, timeout=30)
        if resp.status_code == 401:
            print("ERROR: 401 Unauthorized — check SGO_API_KEY (no sk- prefix for this key).", file=sys.stderr)
            sys.exit(1)
        resp.raise_for_status()
        data = resp.json()
        events = data.get("data") if isinstance(data, dict) else (data if isinstance(data, list) else [])
        if not events:
            break
        out.extend(events)
        cursor = data.get("nextCursor") if isinstance(data, dict) else None
        if not cursor or len(out) >= limit:
            break
    return out[:limit]


def _team_name(t: any) -> str:
    if t is None:
        return ""
    if isinstance(t, str):
        return t
    if isinstance(t, dict):
        names = t.get("names")
        if isinstance(names, dict):
            return names.get("long") or names.get("medium") or names.get("short") or ""
        return t.get("name") or t.get("abbreviation") or t.get("teamName") or ""
    return ""


def events_to_rows(events: list[dict]) -> list[dict]:
    """Flatten events to CSV rows (one per game)."""
    rows = []
    for ev in events:
        ev_id = ev.get("eventID") or ev.get("eventId") or ""
        starts = ev.get("startTime") or ev.get("commenceTime") or ev.get("startDate") or ""
        teams = ev.get("teams")
        if isinstance(teams, list) and len(teams) >= 2:
            home = _team_name(teams[0])
            away = _team_name(teams[1])
        elif isinstance(teams, dict):
            home = _team_name(teams.get("home") or teams.get("homeTeam"))
            away = _team_name(teams.get("away") or teams.get("awayTeam"))
        else:
            home = _team_name(ev.get("homeTeam"))
            away = _team_name(ev.get("awayTeam"))
        status_obj = ev.get("status")
        if isinstance(status_obj, dict):
            starts = starts or status_obj.get("startsAt") or ""
            status_str = status_obj.get("displayLong") or status_obj.get("displayShort") or "final"
        else:
            status_str = str(status_obj) if status_obj else "final"
        rows.append({
            "eventID": ev_id,
            "startTime": starts,
            "homeTeam": home,
            "awayTeam": away,
            "status": status_str,
        })
    return rows


def main() -> None:
    p = argparse.ArgumentParser(description="SGO NBA historical backfill → CSV")
    p.add_argument("--days", type=int, default=7, help="Days back from today")
    p.add_argument("--max-games", type=int, default=100, help="Max games to fetch (nightly: 50)")
    p.add_argument("--out", type=str, default="cache/sgo_nba_games.csv", help="Output CSV path")
    p.add_argument("--api-key", type=str, default=None, help="SGO API key (else SGO_API_KEY env)")
    args = p.parse_args()

    api_key = get_api_key(args.api_key)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    starts_after = start.strftime("%Y-%m-%dT00:00:00Z")
    starts_before = end.strftime("%Y-%m-%dT23:59:59Z")

    events = fetch_events(api_key, starts_after, starts_before, limit=args.max_games)
    rows = events_to_rows(events)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        print("No events found; writing empty CSV.")
    else:
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["eventID", "startTime", "homeTeam", "awayTeam", "status"])
            w.writeheader()
            w.writerows(rows)
        print(f"Wrote {len(rows)} NBA games -> {out_path}")


if __name__ == "__main__":
    main()
