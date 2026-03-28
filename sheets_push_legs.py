# sheets_push_legs.py -- PP + UD combined legs -> Legs tab (universal A-O)
#
# A RunTimestamp  B GameTime  C Site  D Slip  E Player  F Stat+Line
# G Tier  H AvgEdge  I CardEV  J LegID
# K AvgProb  L trueProb  M EV  N overOdds  O underOdds

import argparse, csv, os, time

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"
PP_CSV         = "prizepicks-legs.csv"
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


def _read_csv(path, site_prefix):
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found")
        return []
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
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
            site      = "PP" if "prizepicks" in leg_id.lower() else "UD"

            stat_line = f"{_stat_label(stat)} {line}"
            tier      = _tier(edge_raw)

            rows.append([
                run_ts,         # A RunTimestamp
                game_time,      # B GameTime
                site,           # C Site
                "",             # D Slip (legs don't have slip)
                player,         # E Player
                stat_line,      # F Stat+Line
                tier,           # G Tier
                edge_raw,       # H AvgEdge (raw fraction)
                leg_ev,         # I CardEV (= legEv for legs)
                leg_id,         # J LegID
                true_prob,      # K AvgProb (= trueProb for legs)
                true_prob,      # L trueProb
                leg_ev,         # M EV
                over_odds,      # N overOdds
                under_odds,     # O underOdds
            ])

    rows.sort(key=lambda r: _safe_float(r[7]), reverse=True)
    return rows


def main(dry_run=False):
    print("=== sheets_push_legs.py (separate PP/UD tabs) ===")
    pp_rows = _read_csv(PP_CSV, "prizepicks")
    ud_rows = _read_csv(UD_CSV, "underdog")

    print(f"  PP: {len(pp_rows)} | UD: {len(ud_rows)}")

    if dry_run:
        print("  Dry run -- no writes.")
        return

    svc = get_service()

    # Write PP legs to "Legs" tab
    # Always clear the tab to prevent stale data
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="Legs!A2:O"))
    
    if pp_rows:
        pp_rows.sort(key=lambda r: _safe_float(r[7]), reverse=True)
        _retry(svc.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID, range="Legs!A2",
            valueInputOption="RAW", body={"values": pp_rows}))
        print(f"  Pushed {len(pp_rows)} PP rows -> Legs!A2:O")
        if pp_rows:
            r = pp_rows[0]
            print(f"  PP Top: {r[4]} {r[5]} edge={r[7]:.1%} tier={r[6]}")
    else:
        print("  No PP rows - cleared Legs tab")

    # Write UD legs to "UD-Legs" tab
    # Always clear the tab to prevent stale data
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="UD-Legs!A2:O"))
    
    if ud_rows:
        ud_rows.sort(key=lambda r: _safe_float(r[7]), reverse=True)
        _retry(svc.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID, range="UD-Legs!A2",
            valueInputOption="RAW", body={"values": ud_rows}))
        print(f"  Pushed {len(ud_rows)} UD rows -> UD-Legs!A2:O")
        if ud_rows:
            r = ud_rows[0]
            print(f"  UD Top: {r[4]} {r[5]} edge={r[7]:.1%} tier={r[6]}")
    else:
        print("  No UD rows - cleared UD-Legs tab")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-refresh", action="store_true")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
