# tests/test_sheets_export_meta_and_leg_label.py
# Integration-style: assert meta fields are present and leg_label is used for Leg_Text.

import csv
import json
import os
import sys
import tempfile

# Add project root so we can import sheets_push
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_meta_fields_present():
    """Meta block includes RunId, LastUpdatedET, OddsSnapshotId, OddsFetchedAtET, OddsAgeMinutes, OddsRefreshMode, IncludeAltLines."""
    old_cwd = os.getcwd()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            os.makedirs("artifacts", exist_ok=True)
            with open("artifacts/last_run.json", "w", encoding="utf-8") as f:
                json.dump({
                    "runId": "2026-02-28T14-30-abc123",
                    "lastUpdatedET": "2026-02-28T14:30:00 ET",
                    "oddsSnapshotId": "abc123def456",
                    "oddsFetchedAtET": "2026-02-28T14:00:00 ET",
                    "oddsAgeMinutes": 30,
                    "oddsRefreshMode": "live",
                    "includeAltLines": True,
                    "bankroll": 600,
                }, f, indent=2)
            import sheets_push as sp
            meta = sp._get_run_metadata()
            assert meta["runId"] == "2026-02-28T14-30-abc123"
            assert meta["lastUpdatedET"] == "2026-02-28T14:30:00 ET"
            assert meta["oddsSnapshotId"] == "abc123def456"
            assert meta["oddsFetchedAtET"] == "2026-02-28T14:00:00 ET"
            assert meta["oddsAgeMinutes"] == 30
            assert meta["oddsRefreshMode"] == "live"
            assert meta["includeAltLines"] is True

            rows = sp._meta_rows(meta)
            assert len(rows) == 7
            assert rows[0][0] == "2026-02-28T14-30-abc123"  # A1 = RunId value
            assert rows[1][0] == "LastUpdatedET" and rows[1][1] == "2026-02-28T14:30:00 ET"
            assert rows[2][0] == "OddsSnapshotId"
            assert rows[6][0] == "IncludeAltLines"
            os.chdir(old_cwd)
    finally:
        os.chdir(old_cwd)


def test_leg_label_used_for_leg_text():
    """When CSV has leg_label, it is used as Leg_Text (last column); otherwise fallback to built string."""
    old_cwd = os.getcwd()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            csv_path = "test_legs.csv"
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=[
                    "id", "Sport", "player", "team", "stat", "line", "league", "book",
                    "overOdds", "underOdds", "trueProb", "edge", "legEv",
                    "runTimestamp", "gameTime", "IsWithin24h", "leg_key", "leg_label",
                ])
                w.writeheader()
                w.writerow({
                    "id": "pp-1",
                    "Sport": "NBA",
                    "player": "LeBron James",
                    "team": "LAL",
                    "stat": "points",
                    "line": "25.5",
                    "league": "NBA",
                    "book": "fanduel",
                    "overOdds": "-110",
                    "underOdds": "-110",
                    "trueProb": "0.52",
                    "edge": "0.03",
                    "legEv": "0.025",
                    "runTimestamp": "2026-02-28",
                    "gameTime": "",
                    "IsWithin24h": "TRUE",
                    "leg_key": "prizepicks:lebron-james:points:25.5:over:game",
                    "leg_label": "LeBron James - Points - 25.5",
                })
            import sheets_push as sp
            rows = sp._read_legs_csv(csv_path)
            assert len(rows) == 1
            assert rows[0][16] == "LeBron James - Points - 25.5"

            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=[
                    "id", "Sport", "player", "team", "stat", "line", "league", "book",
                    "overOdds", "underOdds", "trueProb", "edge", "legEv",
                    "runTimestamp", "gameTime", "IsWithin24h",
                ])
                w.writeheader()
                w.writerow({
                    "id": "pp-2",
                    "Sport": "NBA",
                    "player": "Jokic",
                    "team": "DEN",
                    "stat": "points",
                    "line": "28",
                    "league": "NBA",
                    "book": "fd",
                    "overOdds": "-110",
                    "underOdds": "-110",
                    "trueProb": "0.5",
                    "edge": "0.02",
                    "legEv": "0.02",
                    "runTimestamp": "",
                    "gameTime": "",
                    "IsWithin24h": "TRUE",
                })
            rows2 = sp._read_legs_csv(csv_path)
            assert len(rows2) == 1
            assert "Jokic" in rows2[0][16] and "PTS" in rows2[0][16] and "28" in rows2[0][16]
            os.chdir(old_cwd)
    finally:
        os.chdir(old_cwd)


if __name__ == "__main__":
    test_meta_fields_present()
    test_leg_label_used_for_leg_text()
    print("All tests passed.")
