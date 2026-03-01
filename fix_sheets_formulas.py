"""
fix_sheets_formulas.py — Set live Sheets formulas for Engine, Calculator,
and Cards Leg_Text VLOOKUP columns.

Run ONCE after first push, then only if formulas are accidentally cleared.
Uses batchUpdate (1 API call) — no quota issues.

Cards tab schema:
  A:V  = raw data pushed by sheets_push_cards.py
  W:AD = Leg1_Text…Leg8_Text  ← VLOOKUP(LegN_ID → Legs!A:Q col 17, fallback UD-Legs)
  AE:AJ = extra Kelly/risk data pushed by sheets_push_cards.py
  AK  = Summary  ← BYROW TEXTJOIN W:AD

Legs tab schema (also UD-Legs):
  A  = id (VLOOKUP lookup key)
  Q  = Leg_Text (human-readable "Player: Stat > Line (EV: X%)")

Usage:
  py fix_sheets_formulas.py               # batchUpdate all formulas (1 API call)
  py fix_sheets_formulas.py --dry-run     # preview, no writes
  py fix_sheets_formulas.py --sequential  # fallback: one cell at a time (1.1s cooldown)
  py fix_sheets_formulas.py --cooldown 2  # heavier rate-limit protection
"""

import argparse
import os
import time

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"

SHEETS_RETRIES     = 5
SHEETS_RETRY_DELAY = 5.0
DEFAULT_COOLDOWN   = 1.1   # safe for 60 writes/min quota


# ── VLOOKUP helper: checks Legs!A:Q then UD-Legs!A:Q ─────────────────────────
def _leg_text_formula(leg_id_col: str) -> str:
    """
    ARRAYFORMULA that maps a Cards column (e.g. 'E2:E') containing a leg ID
    to the human-readable Leg_Text from Legs!Q or UD-Legs!Q (col 17 of A:Q).
    """
    ref = f"{leg_id_col}2:{leg_id_col}"
    return (
        f'=ARRAYFORMULA(IF({ref}="","",'
        f'IFERROR(VLOOKUP({ref},Legs!A:Q,17,0),'
        f'IFERROR(VLOOKUP({ref},\'UD-Legs\'!A:Q,17,0),""))))'
    )


# ── Cards Leg_Text column headers (W1:AD1 + AK1) — written as plain strings ──
# (These occupy the header row so that W2:AD2 ARRAYFORMULAs don't overwrite them.)
CARDS_LEG_TEXT_HEADERS: dict[str, str] = {
    "Cards!W1":  "Leg1_Text",
    "Cards!X1":  "Leg2_Text",
    "Cards!Y1":  "Leg3_Text",
    "Cards!Z1":  "Leg4_Text",
    "Cards!AA1": "Leg5_Text",
    "Cards!AB1": "Leg6_Text",
    "Cards!AC1": "Leg7_Text",
    "Cards!AD1": "Leg8_Text",
    "Cards!AK1": "Summary",
}

# ── Cards Leg_Text VLOOKUP formulas (W2:AD2 expand downward via ARRAYFORMULA) ─
# Cards columns E:L hold Leg1_ID…Leg8_ID
_PAYOUT_SWITCH = (
    'SWITCH(D2:D,"6F",20,"5F",10,"4F",5,"3F",2.25,"2F",1.5,'
    '"6P",50,"5P",25,"4P",10,"3P",5,"2P",3,10)'
)
# Kelly criterion for a parlay: f* = max(0, payout*p - 1) / (payout - 1) * bankroll
# P2:P = WinProbCash (actual cash win probability for the slip)
# V2:V = Bankroll   D2:D = Slip type (determines payout)
# Cap at 25% of bankroll (half-Kelly) to manage variance.
_KELLY_FORMULA = (
    f'=ARRAYFORMULA(IF(A2:A="","",IFERROR('
    f'MIN(V2:V*0.25,'
    f'MAX(0,({_PAYOUT_SWITCH}*P2:P-1)/({_PAYOUT_SWITCH}-1)*V2:V)'
    f'),0)))'
)

CARDS_LEG_TEXT_FORMULAS: dict[str, str] = {
    "Cards!W2":  _leg_text_formula("E"),   # Leg1_Text ← E = Leg1_ID
    "Cards!X2":  _leg_text_formula("F"),   # Leg2_Text
    "Cards!Y2":  _leg_text_formula("G"),   # Leg3_Text
    "Cards!Z2":  _leg_text_formula("H"),   # Leg4_Text
    "Cards!AA2": _leg_text_formula("I"),   # Leg5_Text
    "Cards!AB2": _leg_text_formula("J"),   # Leg6_Text
    "Cards!AC2": _leg_text_formula("K"),   # Leg7_Text  (UD future-proof)
    "Cards!AD2": _leg_text_formula("L"),   # Leg8_Text  (UD future-proof)
    # KellyStake (R): computed from WinProbCash (P) * payout table * Bankroll (V)
    # Overrides the 0 pushed by sheets_push_cards.py when kellyResult is empty.
    # Formula: f* = max(0, payout*p - 1) / (payout - 1) * bankroll, cap 25%
    "Cards!R2": _KELLY_FORMULA,
    # Summary: join non-blank Leg_Text values for each card row
    "Cards!AK2": (
        '=ARRAYFORMULA(BYROW(W2:AD,LAMBDA(r,'
        'TEXTJOIN(", ",TRUE,FILTER(r,r<>"")))))'
    ),
    # PlayerBlock (S): comma-list of player names from Legs OR UD-Legs (fallback)
    "Cards!S2": (
        '=ARRAYFORMULA(IF(A2:A="","",IFERROR(ARRAYFORMULA(REGEXREPLACE('
        'SUBSTITUTE(TRIM('
        'IFERROR(VLOOKUP(E2:E,Legs!A:C,3,0),IFERROR(VLOOKUP(E2:E,\'UD-Legs\'!A:C,3,0),""))&'
        'IF(F2:F<>","&IFERROR(VLOOKUP(F2:F,Legs!A:C,3,0),IFERROR(VLOOKUP(F2:F,\'UD-Legs\'!A:C,3,0),"")),"")&'
        'IF(G2:G<>","&IFERROR(VLOOKUP(G2:G,Legs!A:C,3,0),IFERROR(VLOOKUP(G2:G,\'UD-Legs\'!A:C,3,0),"")),"")&'
        'IF(H2:H<>","&IFERROR(VLOOKUP(H2:H,Legs!A:C,3,0),IFERROR(VLOOKUP(H2:H,\'UD-Legs\'!A:C,3,0),"")),"")&'
        'IF(I2:I<>","&IFERROR(VLOOKUP(I2:I,Legs!A:C,3,0),IFERROR(VLOOKUP(I2:I,\'UD-Legs\'!A:C,3,0),"")),"")&'
        'IF(J2:J<>","&IFERROR(VLOOKUP(J2:J,Legs!A:C,3,0),IFERROR(VLOOKUP(J2:J,\'UD-Legs\'!A:C,3,0),"")),"")),'
        '",",""),"^,|,$","")),"")))'
    ),
}

# ── Engine tab formulas ───────────────────────────────────────────────────────
# Cards tab column map:
#   E=Leg1_ID, F=Leg2_ID, G=Leg3_ID, H=Leg4_ID, I=Leg5_ID, J=Leg6_ID
#   M=AvgProb, N=AvgEdge%, O=CardEV%, R=KellyStake, D=Slip

def _vlookup_legs(leg_cell: str, return_col: str) -> str:
    """IFERROR chain: check Legs!A:Q then UD-Legs!A:Q, return specified col."""
    pp_col = return_col
    ud_col = return_col.replace("Legs!", "'UD-Legs'!")
    return (
        f"=IFERROR(INDEX({pp_col},MATCH({leg_cell},Legs!A:A,0)),"
        f"IFERROR(INDEX({ud_col},MATCH({leg_cell},'UD-Legs'!A:A,0)),\"\"))"
    )


ENGINE_FORMULAS: dict[str, str] = {
    # Row 2: Leg IDs pulled from Cards tab (E=Leg1_ID ... J=Leg6_ID)
    "Engine!B2": "=IFERROR(Cards!E2,\"\")",
    "Engine!C2": "=IFERROR(Cards!F2,\"\")",
    "Engine!D2": "=IFERROR(Cards!G2,\"\")",
    "Engine!E2": "=IFERROR(Cards!H2,\"\")",
    "Engine!F2": "=IFERROR(Cards!I2,\"\")",
    "Engine!G2": "=IFERROR(Cards!J2,\"\")",
    # H2: KellyStake from Cards!R2
    "Engine!H2": "=IFERROR(Cards!R2,0)",
    # H4: Slip label
    "Engine!H4": "=IFERROR(Cards!D2,\"\")",
    # H8: AvgEdge% from Cards!N2
    "Engine!H8": "=IFERROR(Cards!N2*100,\"\")",
    # Row 3: trueProb per leg (Legs!K = col 11, lookup in col A)
    "Engine!B3": _vlookup_legs("B2", "Legs!K:K"),
    "Engine!C3": _vlookup_legs("C2", "Legs!K:K"),
    "Engine!D3": _vlookup_legs("D2", "Legs!K:K"),
    "Engine!E3": _vlookup_legs("E2", "Legs!K:K"),
    "Engine!F3": _vlookup_legs("F2", "Legs!K:K"),
    "Engine!G3": _vlookup_legs("G2", "Legs!K:K"),
    # Row 4: edge per leg (Legs!L = col 12)
    "Engine!B4": _vlookup_legs("B2", "Legs!L:L"),
    "Engine!C4": _vlookup_legs("C2", "Legs!L:L"),
    "Engine!D4": _vlookup_legs("D2", "Legs!L:L"),
    "Engine!E4": _vlookup_legs("E2", "Legs!L:L"),
    "Engine!F4": _vlookup_legs("F2", "Legs!L:L"),
    "Engine!G4": _vlookup_legs("G2", "Legs!L:L"),
    # Row 5: player name (Legs!C = col 3)
    "Engine!B5": _vlookup_legs("B2", "Legs!C:C"),
    "Engine!C5": _vlookup_legs("C2", "Legs!C:C"),
    "Engine!D5": _vlookup_legs("D2", "Legs!C:C"),
    "Engine!E5": _vlookup_legs("E2", "Legs!C:C"),
    "Engine!F5": _vlookup_legs("F2", "Legs!C:C"),
    "Engine!G5": _vlookup_legs("G2", "Legs!C:C"),
    # Avg trueProb / edge (numeric coerce with *1)
    "Engine!B7": "=IFERROR(AVERAGE(FILTER(B3:G3*1,B2:G2<>\"\")),\"\")",
    "Engine!B8": "=IFERROR(AVERAGE(FILTER(B4:G4*1,B2:G2<>\"\"))*100,\"\")",
}

# ── Calculator formulas ───────────────────────────────────────────────────────
SLIP_PAYOUT = {
    "2P": 3, "3P": 5, "4P": 10, "5P": 25, "6P": 50,
    "2F": 1.5, "3F": 2.25, "4F": 5, "5F": 10, "6F": 20,
}
SLIP_LEGS = {k: int(k[0]) for k in SLIP_PAYOUT}
SLIP_ROWS = {
    "2P": 11, "3P": 12, "3F": 13, "4P": 14,
    "4F": 15, "5P": 16, "5F": 17, "6P": 18, "6F": 19,
}


def _build_calculator_formulas() -> dict[str, str]:
    f: dict[str, str] = {}
    f["Calculator!B7"] = "=IFERROR(AVERAGE(FILTER(Engine!B3:G3*1,Engine!B2:G2<>\"\")),\"\")"
    f["Calculator!B8"] = "=IFERROR(AVERAGE(FILTER(Engine!B4:G4*1,Engine!B2:G2<>\"\"))*100,\"\")"

    for slip, row in SLIP_ROWS.items():
        n   = SLIP_LEGS[slip]
        pay = SLIP_PAYOUT[slip]
        cols = "BCDEFG"[:n]

        # Col A: slip label (static)
        f[f"Calculator!A{row}"] = slip
        # Col B: leg count
        f[f"Calculator!B{row}"] = str(n)
        # Col C: AvgProb for these n legs
        truep = "{" + ",".join(f"Engine!${c}$3*1" for c in cols) + "}"
        f[f"Calculator!C{row}"] = f"=IFERROR(AVERAGE(IFERROR({truep},\"\")),\"\")"
        # Col D: LegMargin% = product(trueProbsN) * payout - 1
        prod = "*".join(f"IFERROR(Engine!${c}$3*1,0)" for c in cols)
        f[f"Calculator!D{row}"] = f"=IFERROR({prod}*{pay}-1,\"\")"
        # Col E: EV% = AvgProb^n * payout - 1
        f[f"Calculator!E{row}"] = f"=IFERROR(POWER(Calculator!$B$7*1,{n})*{pay}-1,\"\")"
        # Col F: ROI$ = EV% * KellyStake
        f[f"Calculator!F{row}"] = f"=IFERROR(Calculator!E{row}*Engine!$H$2,\"\")"

    f["Calculator!B22"] = "=IFERROR(INDEX(A11:A19,MATCH(MAX(E11:E19),E11:E19,0)),\"\")"
    f["Calculator!B23"] = "=IFERROR(INDEX(A11:A19,MATCH(MAX(F11:F19),F11:F19,0)),\"\")"
    f["Calculator!B24"] = "=IFERROR(INDEX(A11:A19,MATCH(MAX(D11:D19),D11:D19,0)),\"\")"
    return f


# ── Auth & batch push ─────────────────────────────────────────────────────────

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


def _col_to_idx(col_str: str) -> int:
    """'A'→0, 'B'→1, 'Z'→25, 'AA'→26, ..."""
    idx = 0
    for ch in col_str:
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1


def _parse_cell(cell_ref: str) -> tuple[str, int, int]:
    """'Cards!W2' → ('Cards', 1, 22)  (0-based row, 0-based col)"""
    sheet, cell = cell_ref.split("!")
    col_str = "".join(c for c in cell if c.isalpha())
    row_str = "".join(c for c in cell if c.isdigit())
    return sheet, int(row_str) - 1, _col_to_idx(col_str)


def _batch_push(service, formulas: dict[str, str], headers: dict[str, str]) -> int:
    """
    Push all cells in one batchUpdate call.
    formulas → formulaValue cells
    headers  → stringValue cells (plain text, not parsed as formula)
    """
    meta = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    title_to_id = {s["properties"]["title"]: s["properties"]["sheetId"]
                   for s in meta.get("sheets", [])}

    requests_body = []

    def _add(cell_ref: str, value: str, is_formula: bool):
        sheet_title, row_idx, col_idx = _parse_cell(cell_ref)
        sheet_id = title_to_id.get(sheet_title)
        if sheet_id is None:
            print(f"  WARNING: sheet '{sheet_title}' not found — skipping {cell_ref}")
            return
        user_val = ({"formulaValue": value} if is_formula
                    else {"stringValue": value})
        requests_body.append({
            "updateCells": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": row_idx,
                    "endRowIndex": row_idx + 1,
                    "startColumnIndex": col_idx,
                    "endColumnIndex": col_idx + 1,
                },
                "rows": [{"values": [{"userEnteredValue": user_val}]}],
                "fields": "userEnteredValue",
            }
        })

    for cell, text in sorted(headers.items()):
        _add(cell, text, is_formula=False)
    for cell, formula in sorted(formulas.items()):
        _add(cell, formula, is_formula=True)

    if not requests_body:
        print("  No valid requests — check sheet titles.")
        return 0

    service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"requests": requests_body},
    ).execute()

    return len(requests_body)


def _push_one(service, cell: str, value: str, is_formula: bool,
              cooldown: float = DEFAULT_COOLDOWN):
    last_err = None
    for attempt in range(SHEETS_RETRIES):
        time.sleep(cooldown if attempt == 0
                   else SHEETS_RETRY_DELAY * (2 ** (attempt - 1)))
        try:
            service.spreadsheets().values().update(
                spreadsheetId=SPREADSHEET_ID,
                range=cell,
                valueInputOption="USER_ENTERED" if is_formula else "RAW",
                body={"values": [[value]]},
            ).execute()
            return
        except HttpError as e:
            last_err = e
            status = e.resp.status if hasattr(e, "resp") else getattr(e, "status_code", None)
            if status in (429, 500, 502, 503) and attempt < SHEETS_RETRIES - 1:
                wait = SHEETS_RETRY_DELAY * (2 ** attempt)
                print(f"  [{status}] quota hit on {cell}, waiting {wait:.0f}s")
                time.sleep(wait)
                continue
            raise
    if last_err:
        raise last_err


def main(dry_run: bool = False, cooldown: float = DEFAULT_COOLDOWN,
         use_batch: bool = True):

    all_formulas = {
        **ENGINE_FORMULAS,
        **_build_calculator_formulas(),
        **CARDS_LEG_TEXT_FORMULAS,
    }
    all_headers = {
        **CARDS_LEG_TEXT_HEADERS,
    }

    total = len(all_formulas) + len(all_headers)
    print(f"Cells to write: {total}  "
          f"({len(all_headers)} headers + {len(all_formulas)} formulas)")
    print(f"Mode: {'DRY RUN' if dry_run else 'batchUpdate (1 API call)' if use_batch else f'sequential {cooldown}s'}\n")

    # Preview
    for cell in sorted(all_headers):
        print(f"  {cell:<30} [RAW]  {all_headers[cell]}")
    for cell in sorted(all_formulas):
        preview = all_formulas[cell][:80] + ("..." if len(all_formulas[cell]) > 80 else "")
        print(f"  {cell:<30} {preview}")

    if dry_run:
        print(f"\nDry run — {total} cells previewed, nothing written.")
        return

    service = get_service()

    if use_batch:
        print(f"\nPushing {total} cells via batchUpdate...")
        try:
            pushed = _batch_push(service, all_formulas, all_headers)
            print(f"Done — {pushed} cells written in 1 API call.")
        except HttpError as e:
            status = e.resp.status if hasattr(e, "resp") else getattr(e, "status_code", None)
            if status == 429:
                print(f"  batchUpdate 429 — falling back to sequential (cooldown={cooldown}s)")
                use_batch = False
            else:
                raise

    if not use_batch:
        ok = 0
        for cell, text in sorted(all_headers.items()):
            _push_one(service, cell, text, is_formula=False, cooldown=cooldown)
            ok += 1
            print(f"  [{ok}/{total}] {cell}")
        for cell, formula in sorted(all_formulas.items()):
            _push_one(service, cell, formula, is_formula=True, cooldown=cooldown)
            ok += 1
            print(f"  [{ok}/{total}] {cell}")
        print(f"\nDone — {ok} cells written sequentially.")

    print()
    print("Cards tab W:AD → VLOOKUP(LegN_ID, Legs!A:Q, 17, 0) with UD-Legs fallback")
    print("Cards tab AK → BYROW TEXTJOIN summary per card row")
    print("Engine B2:G2 → Cards!E2:J2 (live leg IDs) | B3:G5 → Legs!A trueProb/edge/player")
    print("No more #N/A — Suggs UD leg flows: UD-Legs!A:Q → Cards!W:AD")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Set Sheets formulas: Engine, Calculator, Cards Leg_Text VLOOKUPs."
    )
    parser.add_argument("--dry-run", "--dry_run", action="store_true")
    parser.add_argument("--cooldown", type=float, default=DEFAULT_COOLDOWN,
                        help=f"Seconds between sequential writes (default {DEFAULT_COOLDOWN})")
    parser.add_argument("--sequential", action="store_true",
                        help="Force sequential mode (debug only — batchUpdate is preferred)")
    args = parser.parse_args()
    main(dry_run=args.dry_run, cooldown=args.cooldown, use_batch=not args.sequential)
