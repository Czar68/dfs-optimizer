# sheets_push_underdog_legs.py -- UD legs -> UD-Legs tab (universal A-O)

import argparse, csv, os, time

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"
UD_CSV         = "underdog-legs.csv"
RETRIES        = 5
RETRY_DELAY    = 2.0

STAT_LABELS = {
    "points": "PTS", "rebounds": "REB", "assists": "AST", "threes": "3PM",
    "steals": "STL", "blocks": "BLK", "fantasy_points": "FP",
    "pts+reb+ast": "PRA", "pra": "PRA", "points_rebounds_assists": "PRA",
    "pts+ast": "PA", "points_assists": "PA",
    "pts+reb": "PR", "points_rebounds": "PR",
    "reb+ast": "RA", "rebounds_assists": "RA",
    "turnovers": "TO", "stocks": "STK",
}

def _stat_label(stat):
    return STAT_LABELS.get(stat.lower(), stat.replace("_", " ").title())

def _tier(edge_val):
    if edge_val >= 0.08: return "T1"
    if edge_val >= 0.04: return "T2"
    return "T3"

def _safe_float(v, default=0.0):
    try: return float(v)
    except (TypeError, ValueError): return default

def _retry(request):
    for attempt in range(RETRIES):
        try: return request.execute()
        except HttpError as e:
            status = getattr(getattr(e, "resp", None), "status", 0)
            if status in (429, 500, 502, 503) and attempt < RETRIES - 1:
                time.sleep(RETRY_DELAY * (2 ** attempt)); continue
            raise

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


def _read_ud_csv():
    if not os.path.exists(UD_CSV):
        print(f"  WARNING: {UD_CSV} not found")
        return []
    rows = []
    with open(UD_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not any(row.values()): continue
            leg_id = row.get("id", "").strip()
            if not leg_id: continue

            player    = row.get("player", "").strip()
            stat      = row.get("stat", "").strip()
            line      = row.get("line", "").strip()
            edge_raw  = _safe_float(row.get("edge", "0"))
            true_prob = _safe_float(row.get("trueProb", "0"))
            leg_ev    = _safe_float(row.get("legEv", "0"))
            over_odds = row.get("overOdds", "")
            under_odds = row.get("underOdds", "")
            run_ts    = row.get("runTimestamp", "")
            game_time = row.get("gameTime", "")

            stat_line = f"{_stat_label(stat)} {line}"
            tier      = _tier(edge_raw)

            rows.append([
                run_ts, game_time, "UD", "",
                player, stat_line, tier,
                edge_raw, leg_ev, leg_id,
                true_prob, true_prob, leg_ev,
                over_odds, under_odds,
            ])

    rows.sort(key=lambda r: _safe_float(r[7]), reverse=True)
    return rows


def main(dry_run=False):
    print("=== sheets_push_underdog_legs.py (universal A-O) ===")
    rows = _read_ud_csv()
    print(f"  Loaded {len(rows)} UD leg rows")

    if not rows:
        print("  Nothing to push.")
        return

    if rows:
        r = rows[0]
        print(f"  Top: {r[4]} {r[5]} edge={r[7]:.1%} tier={r[6]}")

    if dry_run:
        print("  Dry run -- no writes.")
        return

    svc = get_service()
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="UD-Legs!A2:O"))
    if rows:
        _retry(svc.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID, range="UD-Legs!A2",
            valueInputOption="RAW", body={"values": rows}))
    print(f"  Pushed {len(rows)} rows -> UD-Legs!A2:O")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
