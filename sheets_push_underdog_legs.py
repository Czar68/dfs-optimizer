# sheets_push_underdog_legs.py — UD legs → UD-Legs tab
#
# Same 17-col schema as Legs tab (sheets_push_legs.py):
#   A=id(lookup key)  B=Sport  C=player  D=team  E=stat  F=line
#   G=league  H=book  I=overOdds  J=underOdds  K=trueProb  L=edge
#   M=legEv  N=runTimestamp  O=gameTime  P=IsWithin24h  Q=Leg_Text(display)
#
# Cards formula fallback: IFERROR(VLOOKUP(leg_id, Legs!A:Q, 17, 0),
#                                 IFERROR(VLOOKUP(leg_id, 'UD-Legs'!A:Q, 17, 0), ""))

import argparse
import csv
import os
import time

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES          = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID  = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"
UD_CSV          = "underdog-legs.csv"

SHEETS_RETRIES     = 5
SHEETS_RETRY_DELAY = 2.0

UD_LEGS_HEADERS = [
    "id",           # A ← VLOOKUP lookup key
    "Sport",        # B
    "player",       # C
    "team",         # D
    "stat",         # E
    "line",         # F
    "league",       # G
    "book",         # H
    "overOdds",     # I
    "underOdds",    # J
    "trueProb",     # K
    "edge",         # L
    "legEv",        # M
    "runTimestamp", # N
    "gameTime",     # O
    "IsWithin24h",  # P
    "Leg_Text",     # Q ← "Player: Stat > Line (EV: X%)"
]
assert len(UD_LEGS_HEADERS) == 17

STAT_LABELS = {
    "points":         "PTS",
    "rebounds":       "REB",
    "assists":        "AST",
    "threes":         "3PM",
    "steals":         "STL",
    "blocks":         "BLK",
    "fantasy_points": "FP",
    "pts+reb+ast":    "PRA",
    "pts+ast":        "PA",
    "pts+reb":        "PR",
    "reb+ast":        "RA",
    "turnovers":      "TO",
}

def _stat_label(stat: str) -> str:
    return STAT_LABELS.get(stat.lower(), stat.replace("_", " ").title())

def _make_leg_text(player: str, stat: str, line: str, edge: str) -> str:
    try:
        ev_pct = f"{float(edge) * 100:.1f}"
    except (TypeError, ValueError):
        ev_pct = "0.0"
    try:
        line_str = str(float(line)).rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        line_str = str(line)
    return f"{player}: {_stat_label(stat)} > {line_str} (EV: {ev_pct}%)"

def _col_letter(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s or "A"

def _retry(request):
    last_err = None
    for attempt in range(SHEETS_RETRIES):
        try:
            return request.execute()
        except HttpError as e:
            last_err = e
            status = e.resp.status if hasattr(e, "resp") else getattr(e, "status_code", None)
            if status in (429, 500, 502, 503) and attempt < SHEETS_RETRIES - 1:
                wait = SHEETS_RETRY_DELAY * (2 ** attempt)
                print(f"  [{status}] retrying in {wait:.0f}s...")
                time.sleep(wait)
                continue
            raise
    if last_err:
        raise last_err

def get_service():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        with open("token.json", "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return build("sheets", "v4", credentials=creds)

def _read_ud_csv(path: str) -> list[list]:
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found — skipping UD-Legs push.")
        return []
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not any(row.values()):
                continue
            leg_id = row.get("id", "").strip()
            if not leg_id:
                continue
            player = row.get("player", "").strip()
            stat   = row.get("stat", "").strip()
            line   = row.get("line", "").strip()
            edge   = row.get("edge", "0").strip()

            rows.append([
                leg_id,
                row.get("Sport", ""),
                player,
                row.get("team", ""),
                stat,
                line,
                row.get("league", ""),
                row.get("book", ""),
                row.get("overOdds", ""),
                row.get("underOdds", ""),
                row.get("trueProb", ""),
                edge,
                row.get("legEv", ""),
                row.get("runTimestamp", ""),
                row.get("gameTime", ""),
                row.get("IsWithin24h", ""),
                _make_leg_text(player, stat, line, edge),  # Q
            ])

    try:
        rows.sort(key=lambda r: float(r[11]) if r[11] else 0.0, reverse=True)
    except Exception:
        pass
    return rows


def main(dry_run: bool = False):
    print("=== sheets_push_underdog_legs.py (UD-Legs tab) ===")

    rows = _read_ud_csv(UD_CSV)
    print(f"  Loaded {len(rows)} UD leg rows")

    if not rows:
        print("  Nothing to push.")
        return

    print(f"  Top row: id={rows[0][0]}  Leg_Text={rows[0][16]}")

    if dry_run:
        print("  Dry run — no Sheets writes.")
        for row in rows[:3]:
            print(f"    {row[0]} → {row[16]}")
        return

    service = get_service()
    end_col = _col_letter(len(UD_LEGS_HEADERS))  # Q

    _retry(service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"UD-Legs!A1:{end_col}1",
        valueInputOption="RAW",
        body={"values": [UD_LEGS_HEADERS]},
    ))

    _retry(service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"UD-Legs!A2:{end_col}",
    ))

    _retry(service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range="UD-Legs!A2",
        valueInputOption="RAW",
        body={"values": rows},
    ))

    print(f"  Pushed {len(rows)} rows → UD-Legs!A1:{end_col}{len(rows)+1}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Push UD legs (17 cols, human Leg_Text) to UD-Legs tab.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
