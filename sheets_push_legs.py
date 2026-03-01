# sheets_push_legs.py — PP + UD combined legs → Legs tab
#
# Column layout (A-Q, 17 cols):
#   A  id          ← LOOKUP KEY (e.g. "prizepicks-10008432-rebounds-5")
#   B  Sport       C  player     D  team       E  stat
#   F  line        G  league     H  book       I  overOdds   J  underOdds
#   K  trueProb    L  edge       M  legEv      N  runTimestamp
#   O  gameTime    P  IsWithin24h
#   Q  Leg_Text    ← DISPLAY: "Jalen Suggs: Points > 13.5 (EV: 2.4%)"
#
# Engine VLOOKUP: =VLOOKUP(leg_id, Legs!A:Q, 17, 0)  → returns col Q (Leg_Text)
# Cards W2 formula: =ARRAYFORMULA(IF(E2:E="","",IFERROR(VLOOKUP(E2:E,Legs!A:Q,17,0),...)))

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

PP_CSV          = "prizepicks-legs.csv"
UD_CSV          = "underdog-legs.csv"

SHEETS_RETRIES        = 5
SHEETS_RETRY_DELAY    = 2.0

LEGS_HEADERS = [
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
    "Leg_Text",     # Q ← human-readable display
]
assert len(LEGS_HEADERS) == 17


# ── Stat display mapping ────────────────────────────────────────────────────
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
    """'Jalen Suggs: Points > 13.5 (EV: 2.4%)'"""
    try:
        ev_pct = f"{float(edge) * 100:.1f}"
    except (TypeError, ValueError):
        ev_pct = "0.0"
    try:
        line_str = str(float(line)).rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        line_str = str(line)
    label = _stat_label(stat)
    return f"{player}: {label} > {line_str} (EV: {ev_pct}%)"


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


def _read_csv(path: str, site_prefix: str) -> list[list]:
    """Read a legs CSV and return 17-element row lists with human Leg_Text in col Q."""
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found — skipping")
        return []

    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not any(row.values()):
                continue

            leg_id  = row.get("id", "").strip()
            player  = row.get("player", "").strip()
            stat    = row.get("stat", "").strip()
            line    = row.get("line", "").strip()
            edge    = row.get("edge", "0").strip()

            # Normalize leg_id to canonical "site-rawid-stat-line" format
            if not leg_id:
                continue

            leg_text = _make_leg_text(player, stat, line, edge)

            rows.append([
                leg_id,                          # A  id (VLOOKUP key)
                row.get("Sport", ""),            # B
                player,                          # C
                row.get("team", ""),             # D
                stat,                            # E
                line,                            # F
                row.get("league", ""),           # G
                row.get("book", ""),             # H
                row.get("overOdds", ""),         # I
                row.get("underOdds", ""),        # J
                row.get("trueProb", ""),         # K
                edge,                            # L
                row.get("legEv", ""),            # M
                row.get("runTimestamp", ""),     # N
                row.get("gameTime", ""),         # O
                row.get("IsWithin24h", ""),      # P
                leg_text,                        # Q  Leg_Text (display)
            ])

    # Sort: highest edge first
    try:
        rows.sort(key=lambda r: float(r[11]) if r[11] else 0.0, reverse=True)
    except Exception:
        pass

    return rows


def main(dry_run: bool = False, force_refresh: bool = False):
    print("=== sheets_push_legs.py (PP + UD combined) ===")

    pp_rows = _read_csv(PP_CSV, "prizepicks")
    ud_rows = _read_csv(UD_CSV, "underdog")

    # Merge: PP first (sorted by edge), then UD, deduplicate by leg_id
    seen: set[str] = set()
    combined: list[list] = []
    for row in [*pp_rows, *ud_rows]:
        key = row[0]  # leg_id in col A
        if key and key not in seen:
            seen.add(key)
            combined.append(row)

    print(f"  PP: {len(pp_rows)} | UD: {len(ud_rows)} | Combined unique: {len(combined)}")

    if combined:
        r = combined[0]
        print(f"  Top row: id={r[0]}  player={r[2]}  stat={r[4]}  Leg_Text={r[16]}")

    if dry_run:
        print("  Dry run — no Sheets writes.")
        for row in combined[:3]:
            print(f"    {row[0]} → {row[16]}")
        return

    service = get_service()
    end_col = _col_letter(len(LEGS_HEADERS))  # Q

    # 1) Header row
    _retry(service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Legs!A1:{end_col}1",
        valueInputOption="RAW",
        body={"values": [LEGS_HEADERS]},
    ))

    # 2) Clear old data
    _retry(service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Legs!A2:{end_col}",
    ))

    # 3) Write data
    if combined:
        _retry(service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range="Legs!A2",
            valueInputOption="RAW",
            body={"values": combined},
        ))

    print(f"  Pushed {len(combined)} rows → Legs!A1:{end_col}{len(combined)+1}")
    print("  Col A = lookup key | Col Q = human Leg_Text for Cards W:AD VLOOKUP")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Push PP+UD legs (17 cols, human Leg_Text) to Legs tab.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-refresh", action="store_true",
                        help="Ignored (API refresh is in the TS optimizer — run npm run generate first)")
    args = parser.parse_args()
    main(dry_run=args.dry_run, force_refresh=args.force_refresh)
