# sheets_push_cards.py — PP + UD cards → Cards tab
#
# COLUMN LAYOUT
# ─────────────────────────────────────────────────────
#  Pushed by this script (RAW data):
#   A  Date        B  Site        C  Card_ID     D  Slip
#   E  Leg1_ID     F  Leg2_ID     G  Leg3_ID     H  Leg4_ID
#   I  Leg5_ID     J  Leg6_ID     K  Leg7_ID     L  Leg8_ID
#   M  AvgProb     N  AvgEdge%    O  CardEV%     P  WinProbCash
#   Q  Strength    R  KellyStake  S  PlayerBlock
#   T  KellyFraction  U  GlobalKellyFraction  V  Bankroll
#
#  Formula columns (written by fix_sheets_formulas.py — NOT touched here):
#   W  Leg1_Text   X  Leg2_Text   Y  Leg3_Text   Z  Leg4_Text
#  AA  Leg5_Text  AB  Leg6_Text  AC  Leg7_Text  AD  Leg8_Text
#  AK  Summary
#
#  Pushed separately (same call, range AE:AJ):
#  AE  DailyRiskFrac  AF  TotalKellyRaw  AG  ScalingFactor
#  AH  FinalStake     AI  RiskAlreadyUsed AJ  CardWithin24h
# ─────────────────────────────────────────────────────
# VLOOKUP chain in Sheets (W2 formula):
#   =ARRAYFORMULA(IF(E2:E="","",
#     IFERROR(VLOOKUP(E2:E,Legs!A:Q,17,0),
#     IFERROR(VLOOKUP(E2:E,'UD-Legs'!A:Q,17,0),""))))
# ─────────────────────────────────────────────────────
# Test (2/21 row 2):
#   E2="prizepicks-10008432-rebounds-5"
#   M2≈0.55  N2≈5.01%  O2≈0.076  W2="Brandon Miller: REB > 5 (EV: 6.3%)"

import argparse
import csv
import os
import time
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"

PP_CSV = "prizepicks-cards.csv"
UD_CSV = "underdog-cards.csv"

BANKROLL = float(os.getenv("BANKROLL", "1000"))

SHEETS_RETRIES     = 5
SHEETS_RETRY_DELAY = 2.0

# ── A:V headers (22 cols, pushed as raw data) ────────────────────────────────
CARDS_HEADERS_AV = [
    "Date",                 # A
    "Site",                 # B
    "Card_ID",              # C
    "Slip",                 # D
    "Leg1_ID",              # E  ← machine id, VLOOKUP source
    "Leg2_ID",              # F
    "Leg3_ID",              # G
    "Leg4_ID",              # H
    "Leg5_ID",              # I
    "Leg6_ID",              # J
    "Leg7_ID",              # K
    "Leg8_ID",              # L
    "AvgProb",              # M
    "AvgEdge%",             # N
    "CardEV%",              # O
    "WinProbCash",          # P
    "Strength",             # Q
    "KellyStake",           # R
    "PlayerBlock",          # S
    "KellyFraction",        # T
    "GlobalKellyFraction",  # U
    "Bankroll",             # V
]
assert len(CARDS_HEADERS_AV) == 22

# ── AE:AJ headers (6 cols, pushed separately to skip W:AD formula cols) ──────
CARDS_HEADERS_AE_AJ = [
    "DailyRiskFraction",    # AE
    "TotalKellyRaw",        # AF
    "ScalingFactor",        # AG
    "FinalStake",           # AH
    "RiskAlreadyUsedToday", # AI
    "CardWithin24h",        # AJ
]
assert len(CARDS_HEADERS_AE_AJ) == 6


def _col_letter(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s or "A"

# Column indices (1-based):  V=22, W=23...AD=30, AE=31...AJ=36
_COL_V  = 22
_COL_AE = 31   # first extra data col
_COL_AJ = 36   # last extra data col


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


_service = None
def get_service():
    global _service
    if _service:
        return _service
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
    _service = build("sheets", "v4", credentials=creds)
    return _service


def _is_within_24h(ts_str: str) -> bool:
    try:
        clean = ts_str.strip().split(" ET")[0].split(" EST")[0].split(" CST")[0]
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600 <= 24
    except Exception:
        return True


def _f(val: object, default: float = 0.0) -> float:
    try:
        return float(val)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _load_csv(path: str) -> list[dict]:
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found — skipping")
        return []
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if any(row.values()):
                rows.append(row)
    print(f"  Loaded {len(rows)} rows from {path}")
    return rows


def _build_rows(pp_rows: list[dict], ud_rows: list[dict]) -> tuple[list[list], list[list]]:
    """
    Returns (av_data, ae_aj_data):
      av_data    — list of 22-element rows for cols A:V
      ae_aj_data — list of 6-element rows for cols AE:AJ
    Both lists are the same length (one entry per card).
    """
    leg_keys = [f"leg{i}Id" for i in range(1, 9)]   # leg1Id … leg8Id (8 legs)
    card_counter: dict[str, int]   = {}
    date_risk:    dict[str, float] = {}

    tagged = [(r, "PP") for r in pp_rows] + [(r, "UD") for r in ud_rows]

    av_rows: list[list]    = []
    ae_aj_rows: list[list] = []

    for row, default_site in tagged:
        ts       = row.get("runTimestamp", "")
        date_str = ts[:10] if ts else datetime.now().strftime("%Y-%m-%d")
        site     = row.get("site", default_site)
        slip     = row.get("flexType", "")

        card_counter[date_str] = card_counter.get(date_str, 0) + 1
        card_id = f"{site}-{slip}-{card_counter[date_str]:03d}"

        leg_ids = [row.get(k, "") for k in leg_keys]   # 8 items

        avg_prob     = _f(row.get("avgProb",     "0"))
        avg_edge_pct = _f(row.get("avgEdgePct",  "0"))
        card_ev      = _f(row.get("cardEv",      "0"))
        win_prob     = _f(row.get("winProbCash", "0"))
        eff_score    = row.get("efficiencyScore", "")
        kelly_raw    = _f(row.get("kellyRawFraction",    "0"))
        kelly_capped = _f(row.get("kellyCappedFraction", "0"))
        kelly_final  = _f(row.get("kellyFinalFraction",  "0"))
        kelly_stake  = _f(row.get("kellyStake",          "0"))

        risk_already = date_risk.get(date_str, 0.0)
        date_risk[date_str] = risk_already + kelly_stake

        total_raw = round(kelly_raw * BANKROLL, 4)
        scaling   = round(kelly_capped / kelly_raw, 4) if kelly_raw else 1.0

        av_rows.append([
            date_str,               # A  Date
            site,                   # B  Site
            card_id,                # C  Card_ID
            slip,                   # D  Slip
            *leg_ids,               # E–L  Leg1_ID … Leg8_ID  (8 items)
            round(avg_prob, 6),     # M  AvgProb
            round(avg_edge_pct, 6), # N  AvgEdge%
            round(card_ev, 6),      # O  CardEV%
            round(win_prob, 6),     # P  WinProbCash
            eff_score,              # Q  Strength
            round(kelly_stake, 4),  # R  KellyStake
            "",                     # S  PlayerBlock (leave for sheet formula)
            round(kelly_capped, 6), # T  KellyFraction
            round(kelly_raw, 6),    # U  GlobalKellyFraction
            BANKROLL,               # V  Bankroll
        ])
        assert len(av_rows[-1]) == 22, f"A:V row = {len(av_rows[-1])}, expected 22"

        ae_aj_rows.append([
            round(kelly_final, 6),                              # AE  DailyRiskFraction
            total_raw,                                          # AF  TotalKellyRaw
            scaling,                                            # AG  ScalingFactor
            round(kelly_stake, 4),                              # AH  FinalStake
            round(risk_already, 4),                             # AI  RiskAlreadyUsedToday
            "TRUE" if _is_within_24h(ts) else "FALSE",          # AJ  CardWithin24h
        ])
        assert len(ae_aj_rows[-1]) == 6, f"AE:AJ row = {len(ae_aj_rows[-1])}, expected 6"

    return av_rows, ae_aj_rows


def main(dry_run: bool = False):
    print("=== sheets_push_cards.py ===")
    print(f"  Bankroll: ${BANKROLL:,.2f}")

    pp_rows = _load_csv(PP_CSV)
    ud_rows = _load_csv(UD_CSV)

    if not pp_rows and not ud_rows:
        print("  No card data found — aborting.")
        return

    av_data, ae_aj_data = _build_rows(pp_rows, ud_rows)
    n = len(av_data)
    print(f"  Built {n} card rows ({len(pp_rows)} PP + {len(ud_rows)} UD)")

    if av_data:
        r = av_data[0]
        print(f"  Row 2 preview: Date={r[0]} Site={r[1]} Slip={r[3]} "
              f"Leg1_ID={r[4]} AvgProb={r[12]:.4f} AvgEdge%={r[13]:.4f} CardEV%={r[14]:.4f}")

    if dry_run:
        print("  Dry run — no Sheets writes.")
        return

    svc      = get_service()
    col_v    = _col_letter(_COL_V)   # "V"
    col_aj   = _col_letter(_COL_AJ)  # "AJ"
    col_ae   = _col_letter(_COL_AE)  # "AE"

    # 1) Write A:V headers (row 1) — does NOT touch W:AD formula columns
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Cards!A1:{col_v}1",
        valueInputOption="RAW",
        body={"values": [CARDS_HEADERS_AV]},
    ))

    # 2) Write AE:AJ headers (row 1)
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Cards!{col_ae}1:{col_aj}1",
        valueInputOption="RAW",
        body={"values": [CARDS_HEADERS_AE_AJ]},
    ))

    # 3) Clear A:V data rows (leaves W:AD formulas intact)
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Cards!A2:{col_v}",
    ))

    # 4) Clear AE:AJ data rows
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Cards!{col_ae}2:{col_aj}",
    ))

    # 5) Write A:V data (22 cols)
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range="Cards!A2",
        valueInputOption="RAW",
        body={"values": av_data},
    ))

    # 6) Write AE:AJ data (6 cols)
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Cards!{col_ae}2",
        valueInputOption="RAW",
        body={"values": ae_aj_data},
    ))

    print(f"  Pushed {n} rows → Cards A:V + AE:AJ ({n+1} rows total incl. header)")
    print("  W:AD formula columns (Leg_Text VLOOKUPs) left intact.")
    print("  Run: py fix_sheets_formulas.py  (once, to set W:AD formulas if not yet set)")

    # 7) Apply tier-based conditional formatting on CardEV% (col O = index 14)
    _apply_tier_colors(svc, n)


def _apply_tier_colors(svc, n_rows: int):
    """Color-code rows by implied tier: green=T1 (EV>=8%), yellow=T2 (EV>=4%), red=fragile."""
    try:
        sheet_meta = _retry(svc.spreadsheets().get(
            spreadsheetId=SPREADSHEET_ID,
            fields="sheets(properties(title,sheetId))",
        ))
        sheet_id = None
        for sh in sheet_meta.get("sheets", []):
            if sh["properties"]["title"] == "Cards":
                sheet_id = sh["properties"]["sheetId"]
                break
        if sheet_id is None:
            print("  WARNING: 'Cards' sheet not found — skipping tier colors")
            return

        ev_col = 14  # O = CardEV% (0-indexed)
        requests = []

        # Clear existing conditional formatting first
        requests.append({"deleteConditionalFormatRule": {
            "sheetId": sheet_id,
            "index": 0,
        }})

        def _color_rule(formula: str, r: float, g: float, b: float, idx: int):
            return {"addConditionalFormatRule": {
                "rule": {
                    "ranges": [{"sheetId": sheet_id, "startRowIndex": 1,
                                "endRowIndex": n_rows + 1, "startColumnIndex": 0,
                                "endColumnIndex": 36}],
                    "booleanRule": {
                        "condition": {"type": "CUSTOM_FORMULA",
                                      "values": [{"userEnteredValue": formula}]},
                        "format": {"backgroundColor": {"red": r, "green": g, "blue": b}},
                    },
                },
                "index": idx,
            }}

        # Tier 1: EV >= 8% → green
        requests.append(_color_rule("=$O2>=0.08", 0.85, 1.0, 0.85, 0))
        # Tier 2: EV >= 4% → yellow
        requests.append(_color_rule("=AND($O2>=0.04,$O2<0.08)", 1.0, 1.0, 0.80, 1))
        # Tier 3: EV < 4% → light grey
        requests.append(_color_rule("=$O2<0.04", 0.95, 0.95, 0.95, 2))

        try:
            _retry(svc.spreadsheets().batchUpdate(
                spreadsheetId=SPREADSHEET_ID,
                body={"requests": requests},
            ))
            print("  Applied tier color formatting (T1=green, T2=yellow, T3=grey)")
        except HttpError:
            # If deleteConditionalFormatRule fails (no existing rules), retry without it
            _retry(svc.spreadsheets().batchUpdate(
                spreadsheetId=SPREADSHEET_ID,
                body={"requests": requests[1:]},
            ))
            print("  Applied tier color formatting (T1=green, T2=yellow, T3=grey)")

    except Exception as e:
        print(f"  WARNING: Could not apply tier colors: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Push PP+UD cards to Cards tab (A:V + AE:AJ).")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--bankroll", type=float, default=None)
    parser.add_argument("--force-refresh", action="store_true",
                        help="Hint: run 'npm run generate' first to rebuild CSVs from live APIs")
    args = parser.parse_args()
    if args.bankroll is not None:
        BANKROLL = args.bankroll
    if args.force_refresh:
        print("  --force-refresh: re-reading CSVs (run 'npm run generate' to rebuild from APIs)")
    main(dry_run=args.dry_run)
