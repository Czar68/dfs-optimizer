#!/usr/bin/env python3
"""
Fetch NBA box scores from ESPN (no API key). Used by settle_results.py to get
actual stats per player/game for settling leg outcomes.

Usage:
    from scripts.espn_boxscore import fetch_all_player_stats_for_date
    stats = fetch_all_player_stats_for_date("2026-03-06")  # player_key -> {points, rebounds, ...}
    value = get_stat_value_from_box(stats.get("jalen brunson"), "points")
"""

import re
import time
from typing import Any

import requests

ESPN_SCOREBOARD = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
ESPN_SUMMARY = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary"
RATE_DELAY_SEC = 1.0
HEADERS = {"Accept": "application/json", "User-Agent": "NBA-Props-Optimizer/1.0"}


def _normalize_name(name: str) -> str:
    if not name:
        return ""
    s = re.sub(r"\s*(Jr\.?|III?|IV|II)\s*$", "", name, flags=re.IGNORECASE)
    s = " ".join(s.split()).strip().lower()
    return s


def get_scoreboard_game_ids(date: str) -> list[str]:
    """Date as YYYY-MM-DD or YYYYMMDD. Returns list of ESPN event IDs."""
    dates_param = date.replace("-", "")[:8]
    url = f"{ESPN_SCOREBOARD}?dates={dates_param}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception:
        return []
    events = data.get("events") or []
    return [e["id"] for e in events if e.get("id")]


def _one_player_stats(raw: dict[str, Any]) -> dict[str, float]:
    out = {
        "points": 0.0,
        "rebounds": 0.0,
        "assists": 0.0,
        "threePointFieldGoalsMade": 0.0,
        "steals": 0.0,
        "blocks": 0.0,
        "turnovers": 0.0,
    }
    stat_list = raw.get("statistics") or raw.get("stats")
    if not isinstance(stat_list, list):
        return out
    for s in stat_list:
        if not isinstance(s, dict):
            continue
        name = ((s.get("name") or s.get("label") or s.get("abbreviation")) or "").lower()
        try:
            val = float(s.get("displayValue") or s.get("value") or 0)
        except (TypeError, ValueError):
            val = 0
        if "point" in name and "three" not in name and "3" not in name:
            out["points"] = val
        elif "rebound" in name or name == "reb":
            out["rebounds"] = val
        elif "assist" in name or name == "ast":
            out["assists"] = val
        elif "three" in name or name in ("3pt", "3pm", "3ptm"):
            out["threePointFieldGoalsMade"] = val
        elif "steal" in name or name == "stl":
            out["steals"] = val
        elif "block" in name or name == "blk":
            out["blocks"] = val
        elif "turnover" in name or name in ("to", "tov"):
            out["turnovers"] = val
    return out


LABEL_TO_FIELD = {
    "min": "minutes",
    "pts": "points",
    "reb": "rebounds",
    "ast": "assists",
    "stl": "steals",
    "blk": "blocks",
    "to": "turnovers",
    "3pm": "threePointFieldGoalsMade",
}


def _parse_boxscore_players(summary: Any) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    box = (summary or {}).get("boxscore")
    if not box or not isinstance(box, dict):
        return out

    players_arr = box.get("players")
    if isinstance(players_arr, list):
        for team_group in players_arr:
            for cat in team_group.get("statistics") or []:
                labels = [str(x).lower() for x in (cat.get("labels") or cat.get("keys") or [])]
                athletes = cat.get("athletes") or []
                if not labels or not athletes:
                    continue
                for ath in athletes:
                    if not isinstance(ath, dict):
                        continue
                    athlete_obj = ath.get("athlete") or {}
                    display_name = (
                        athlete_obj.get("displayName")
                        or athlete_obj.get("name")
                        or athlete_obj.get("shortName")
                        or ath.get("displayName")
                        or ath.get("name")
                        or ath.get("shortName")
                        or ""
                    )
                    if not display_name:
                        continue
                    key = _normalize_name(display_name)
                    existing = out.setdefault(
                        key,
                        {
                            "points": 0,
                            "rebounds": 0,
                            "assists": 0,
                            "threePointFieldGoalsMade": 0,
                            "steals": 0,
                            "blocks": 0,
                            "turnovers": 0,
                        },
                    )
                    stats_arr = ath.get("stats")
                    if isinstance(stats_arr, list):
                        for i, label in enumerate(labels):
                            if i >= len(stats_arr):
                                break
                            field = LABEL_TO_FIELD.get(label)
                            if not field:
                                continue
                            try:
                                existing[field] = float(stats_arr[i])
                            except (TypeError, ValueError):
                                pass
                    out[key] = existing

    if out:
        return out

    for team in box.get("teams") or []:
        for a in team.get("athletes") or []:
            if not isinstance(a, dict):
                continue
            display_name = a.get("displayName") or a.get("name") or a.get("shortName") or ""
            if display_name:
                out[_normalize_name(display_name)] = _one_player_stats(a)
    return out


def get_box_score_for_game(game_id: str) -> dict[str, dict[str, float]]:
    """Fetch one game summary; return player_key -> stats dict."""
    url = f"{ESPN_SUMMARY}?event={game_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return _parse_boxscore_players(r.json())
    except Exception:
        return {}


def fetch_all_player_stats_for_date(date: str) -> dict[str, dict[str, float]]:
    """
    Fetch all player stats for an NBA date. Returns dict: normalized_player_name -> stats.
    Stats include points, rebounds, assists, threePointFieldGoalsMade, steals, blocks, turnovers.
    """
    game_ids = get_scoreboard_game_ids(date)
    all_stats: dict[str, dict[str, float]] = {}
    for gid in game_ids:
        time.sleep(RATE_DELAY_SEC)
        game_stats = get_box_score_for_game(gid)
        for k, v in game_stats.items():
            all_stats[k] = v
    return all_stats


def get_stat_value_from_box(stats: dict[str, float] | None, stat_type: str) -> float:
    """
    Map our stat_type (points, rebounds, assists, threes, etc.) to the value from box stats.
    Combo stats (PRA, PR, etc.) are summed. Returns 0 if unknown or missing.
    """
    if not stats:
        return 0.0
    s = (stat_type or "").lower().replace(" ", "").replace("_", "").replace("-", "")
    pts = stats.get("points", 0) or 0
    reb = stats.get("rebounds", 0) or 0
    ast = stats.get("assists", 0) or 0
    threes = stats.get("threePointFieldGoalsMade", 0) or 0
    stl = stats.get("steals", 0) or 0
    blk = stats.get("blocks", 0) or 0
    tov = stats.get("turnovers", 0) or 0

    if ("point" in s or s == "pts") and "3" not in s and "three" not in s and "reb" not in s and "ast" not in s:
        return float(pts)
    if "rebound" in s or s == "reb":
        return float(reb)
    if "assist" in s or s == "ast":
        return float(ast)
    if "three" in s or s in ("3pm", "3pt", "threes", "threesmade", "threepointersmade"):
        return float(threes)
    if "steal" in s or s == "stl":
        return float(stl)
    if "block" in s or s == "blk":
        return float(blk)
    if "turnover" in s or s in ("to", "tov"):
        return float(tov)
    if s in ("pra", "pointsreboundsassists", "pts+reb+ast"):
        return float(pts + reb + ast)
    if s in ("pr", "pointsrebounds", "pts+reb"):
        return float(pts + reb)
    if s in ("pa", "pointsassists", "pts+ast"):
        return float(pts + ast)
    if s in ("ra", "reboundsassists", "reb+ast"):
        return float(reb + ast)
    if s in ("stocks", "stealsblocks", "stl+blk"):
        return float(stl + blk)
    return 0.0


def find_player_stats(date_stats: dict[str, dict[str, float]], player_name: str) -> dict[str, float] | None:
    """Match leg player name to box score key (normalized; fallback last name)."""
    norm = _normalize_name(player_name or "")
    if not norm:
        return None
    if norm in date_stats:
        return date_stats[norm]
    last = norm.split()[-1] if norm.split() else ""
    for key, st in date_stats.items():
        if key.endswith(" " + last) or key == last:
            return st
    return None
