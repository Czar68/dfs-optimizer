# sheets_setup_9tab.py -- Setup: 11-tab NBA Props system (A-W, 23 cols)
# Deletes dead tabs, ensures all tabs exist, applies formatting + formulas.
# Safe to re-run: clears old conditional rules first.
#
# Column layout (A-W, 23 cols):
#   A RunTime  B GameTime  C Site  D Slip  E Player  F Stat+Line
#   G Pick  H KellyStake$  I Tier  J AvgEdge%  K CardEV  L LegID (hidden)
#   M ParlayGroup  N AvgProb%  O trueProb%  P underOdds  Q overOdds
#   R EV  S 1.5Kelly  T DeepLink  U LastRun  V Notes  W CardKelly$
#
# Cards tab: Row 1 = Headers only, Row 2+ = Data
# Dashboard tab: bankroll metrics + Edge B threshold (A11:B14)
# Results Tracker: manual HIT/MISS tracking

import os, sys, time
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"

DEAD_TABS = ["Cards_Data", "Tier1", "Tier2", "Calculator", "Engine"]

REQUIRED_TABS = [
    "Legs", "UD-Legs", "Cards",
    "Tier 1", "Tier 2", "Tier 3",
    "Parlay Simulator", "EV Heatmap", "Book Comparison",
    "Dashboard", "Results Tracker",
]

CARDS_HEADERS = [
    "RunTime",       # A  0
    "GameTime",      # B  1
    "Site",          # C  2
    "Slip",          # D  3
    "Player",        # E  4
    "Stat+Line",     # F  5
    "Pick",          # G  6
    "KellyStake$",   # H  7
    "Tier",          # I  8
    "AvgEdge%",      # J  9
    "CardEV",        # K  10
    "LegID",         # L  11
    "ParlayGroup",   # M  12
    "AvgProb%",      # N  13
    "trueProb%",     # O  14
    "underOdds",     # P  15
    "overOdds",      # Q  16
    "EV",            # R  17
    "1.5Kelly",      # S  18
    "DeepLink",      # T  19
    "LastRun",       # U  20
    "Notes",         # V  21
    "CardKelly$",    # W  22
]

NUM_COLS = 23
BANKROLL = 600
RETRIES = 5
RETRY_DELAY = 2.0

RESULTS_HEADERS = [
    "RunDate", "Site", "Slip", "Player", "Stat+Line", "Pick",
    "trueProb%", "CardEV", "ParlayGroup", "LegID", "ACTUAL", "LegHit01",
    "CardGroup", "CardHitAll",
]


def _retry(request):
    for attempt in range(RETRIES):
        try:
            return request.execute()
        except HttpError as e:
            status = getattr(getattr(e, "resp", None), "status", 0)
            if status in (429, 500, 502, 503) and attempt < RETRIES - 1:
                time.sleep(RETRY_DELAY * (2 ** attempt))
                continue
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


def _get_sheets(svc):
    meta = _retry(svc.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets(properties(title,sheetId))"
    ))
    return {s["properties"]["title"]: s["properties"]["sheetId"]
            for s in meta.get("sheets", [])}


def _delete_tabs(svc, sheets_map):
    reqs = []
    for name in DEAD_TABS:
        if name in sheets_map:
            reqs.append({"deleteSheet": {"sheetId": sheets_map[name]}})
            print(f"  DELETE tab: {name}")
    if reqs:
        _retry(svc.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))


def _create_missing_tabs(svc, sheets_map):
    reqs = []
    for name in REQUIRED_TABS:
        if name not in sheets_map:
            reqs.append({"addSheet": {"properties": {"title": name}}})
            print(f"  CREATE tab: {name}")
    if reqs:
        resp = _retry(svc.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
        for reply in resp.get("replies", []):
            if "addSheet" in reply:
                props = reply["addSheet"]["properties"]
                sheets_map[props["title"]] = props["sheetId"]


def _write_headers(svc):
    # Clear only header row so we don't leave a blank row 2 before push runs
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="Cards!A1:W1"))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="Cards!A1:W1",
        valueInputOption="RAW", body={"values": [CARDS_HEADERS]}))
    for name in ["Legs", "UD-Legs", "Tier 1", "Tier 2", "Tier 3"]:
        _retry(svc.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID, range=f"'{name}'!A1:W1",
            valueInputOption="RAW", body={"values": [CARDS_HEADERS]}))
    print("  Wrote headers A1:W1 on Cards, Legs, UD-Legs, Tier 1-3")


def _set_legs_ud_formulas(svc):
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="Legs!A2:W10000"))
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="UD-Legs!A2:W10000"))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="Legs!A2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=IFERROR(FILTER(Cards!A2:W10000,Cards!C2:C10000="PP"),"")']]}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="UD-Legs!A2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=IFERROR(FILTER(Cards!A2:W10000,Cards!C2:C10000="UD"),"")']]}))
    print("  Legs=FILTER(PP); UD-Legs=FILTER(UD) on Cards!A2:W10000")


def _clear_conditional_formats(svc):
    meta = _retry(svc.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets(properties(sheetId),conditionalFormats)"
    ))
    reqs = []
    for sheet in meta.get("sheets", []):
        sid = sheet["properties"]["sheetId"]
        for i in range(len(sheet.get("conditionalFormats", [])) - 1, -1, -1):
            reqs.append({"deleteConditionalFormatRule": {"sheetId": sid, "index": i}})
    if reqs:
        _retry(svc.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
        print(f"  Cleared {len(reqs)} existing conditional format rules")


def _apply_formatting(svc, sheets_map):
    reqs = []
    dark_blue = {"red": 0.11, "green": 0.22, "blue": 0.45}
    white = {"red": 1.0, "green": 1.0, "blue": 1.0}
    dark_green = {"red": 0.22, "green": 0.56, "blue": 0.24}
    light_green = {"red": 0.72, "green": 0.88, "blue": 0.73}
    red_bg = {"red": 0.96, "green": 0.73, "blue": 0.71}
    gold = {"red": 1.0, "green": 0.84, "blue": 0.0}
    yellow = {"red": 1.0, "green": 1.0, "blue": 0.6}
    gray = {"red": 0.9, "green": 0.9, "blue": 0.9}

    def _card_tier_fmt(sid, ds):
        """Shared formatting rules for Cards/Tier tabs."""
        r = []
        # Row 1 header
        r.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": NUM_COLS},
            "cell": {"userEnteredFormat": {
                "backgroundColor": dark_blue,
                "textFormat": {"bold": True, "foregroundColor": white}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)",
        }})
        # Freeze 1 row, 8 cols (A-H)
        r.append({"updateSheetProperties": {
            "properties": {"sheetId": sid,
                           "gridProperties": {"frozenRowCount": 1, "frozenColumnCount": 8}},
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }})
        # Data rows: black on white
        r.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                      "startColumnIndex": 0, "endColumnIndex": NUM_COLS},
            "cell": {"userEnteredFormat": {
                "backgroundColor": {"red": 1, "green": 1, "blue": 1},
                "textFormat": {"foregroundColor": {"red": 0, "green": 0, "blue": 0}, "bold": False}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)",
        }})
        # H (7) KellyStake$: currency
        r.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                      "startColumnIndex": 7, "endColumnIndex": 8},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
        # S (18) 1.5Kelly: currency
        r.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                      "startColumnIndex": 18, "endColumnIndex": 19},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
        # W (22) CardKelly$: currency
        r.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                      "startColumnIndex": 22, "endColumnIndex": 23},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
        # J (9) AvgEdge%, N (13) AvgProb%, O (14) trueProb%: percent
        for col in [9, 13, 14]:
            r.append({"repeatCell": {
                "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                          "startColumnIndex": col, "endColumnIndex": col + 1},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
                "fields": "userEnteredFormat.numberFormat",
            }})
        # K (10) CardEV, R (17) EV: number 3 dec
        for col in [10, 17]:
            r.append({"repeatCell": {
                "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                          "startColumnIndex": col, "endColumnIndex": col + 1},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "0.000"}}},
                "fields": "userEnteredFormat.numberFormat",
            }})
        # M (12) ParlayGroup: integer so it shows 0, 1, 2… not 0.0%, 100.0%
        r.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                      "startColumnIndex": 12, "endColumnIndex": 13},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "0"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
        # Hide LegID L (11)
        r.append({"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 11, "endIndex": 12},
            "properties": {"hiddenByUser": True}, "fields": "hiddenByUser",
        }})
        # --- Conditional formatting ---
        # Parlay bands at HIGHEST index (lowest priority = background layer).
        # H/I/J rules at LOW index (high priority) override bands on their columns.
        idx = 0
        # H (7) KellyStake$: >=10 gold, >=5 yellow, <5 gray
        for thresh, color in [("10", gold), ("5", yellow)]:
            r.append({"addConditionalFormatRule": {"rule": {
                "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                            "startColumnIndex": 7, "endColumnIndex": 8}],
                "booleanRule": {"condition": {"type": "NUMBER_GREATER_THAN_EQ", "values": [{"userEnteredValue": thresh}]},
                                "format": {"backgroundColor": color}},
            }, "index": idx}})
            idx += 1
        r.append({"addConditionalFormatRule": {"rule": {
            "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                        "startColumnIndex": 7, "endColumnIndex": 8}],
            "booleanRule": {"condition": {"type": "NUMBER_LESS", "values": [{"userEnteredValue": "5"}]},
                            "format": {"backgroundColor": gray}},
        }, "index": idx}})
        idx += 1
        # I (8) Tier: T1 green, T2 yellow, T3 gray
        for tval, tcolor in [("T1", {"red": 0.56, "green": 0.93, "blue": 0.56}), ("T2", yellow), ("T3", gray)]:
            r.append({"addConditionalFormatRule": {"rule": {
                "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                            "startColumnIndex": 8, "endColumnIndex": 9}],
                "booleanRule": {"condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": tval}]},
                                "format": {"backgroundColor": tcolor}},
            }, "index": idx}})
            idx += 1
        # J (9) AvgEdge%: >=8% dark green, >=4% light green, <4% red
        r.append({"addConditionalFormatRule": {"rule": {
            "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                        "startColumnIndex": 9, "endColumnIndex": 10}],
            "booleanRule": {"condition": {"type": "NUMBER_GREATER_THAN_EQ", "values": [{"userEnteredValue": "0.08"}]},
                            "format": {"backgroundColor": dark_green, "textFormat": {"foregroundColor": white}}},
        }, "index": idx}})
        idx += 1
        r.append({"addConditionalFormatRule": {"rule": {
            "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                        "startColumnIndex": 9, "endColumnIndex": 10}],
            "booleanRule": {"condition": {"type": "NUMBER_GREATER_THAN_EQ", "values": [{"userEnteredValue": "0.04"}]},
                            "format": {"backgroundColor": light_green}},
        }, "index": idx}})
        idx += 1
        r.append({"addConditionalFormatRule": {"rule": {
            "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                        "startColumnIndex": 9, "endColumnIndex": 10}],
            "booleanRule": {"condition": {"type": "NUMBER_LESS", "values": [{"userEnteredValue": "0.04"}]},
                            "format": {"backgroundColor": red_bg}},
        }, "index": idx}})
        idx += 1
        # Parlay color bands A–W (full row) — LOWEST priority so H/I/J rules override on their columns
        band_blue = {"red": 0.87, "green": 0.92, "blue": 1.0}
        band_orange = {"red": 1.0, "green": 0.92, "blue": 0.80}
        band_purple = {"red": 0.90, "green": 0.85, "blue": 0.95}
        band_green = {"red": 0.85, "green": 0.95, "blue": 0.85}
        for formula, color in [
            ("=MOD($M2,4)+1=1", band_blue),
            ("=MOD($M2,4)+1=2", band_orange),
            ("=MOD($M2,4)+1=3", band_purple),
            ("=MOD($M2,4)+1=4", band_green),
        ]:
            r.append({"addConditionalFormatRule": {"rule": {
                "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                            "startColumnIndex": 0, "endColumnIndex": NUM_COLS}],
                "booleanRule": {
                    "condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": formula}]},
                    "format": {"backgroundColor": color}},
            }, "index": idx}})
            idx += 1
        return r

    # ─── CARDS ───
    cards_sid = sheets_map.get("Cards")
    if cards_sid is not None:
        reqs.extend(_card_tier_fmt(cards_sid, 1))

    # ─── LEGS, UD-LEGS ───
    for name in ["Legs", "UD-Legs"]:
        sid = sheets_map.get(name)
        if sid is None:
            continue
        reqs.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": NUM_COLS},
            "cell": {"userEnteredFormat": {
                "backgroundColor": dark_blue,
                "textFormat": {"bold": True, "foregroundColor": white}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)",
        }})
        reqs.append({"updateSheetProperties": {
            "properties": {"sheetId": sid,
                           "gridProperties": {"frozenRowCount": 1, "frozenColumnCount": 8}},
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }})
        reqs.append({"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": 11, "endIndex": 12},
            "properties": {"hiddenByUser": True}, "fields": "hiddenByUser",
        }})

    # ─── TIER 1/2/3 ───
    for name in ["Tier 1", "Tier 2", "Tier 3"]:
        sid = sheets_map.get(name)
        if sid is not None:
            reqs.extend(_card_tier_fmt(sid, 1))

    if reqs:
        _retry(svc.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
        print(f"  Applied formatting ({len(reqs)} requests)")


def _setup_dashboard_tab(svc, sheets_map):
    sid = sheets_map.get("Dashboard")
    if sid is None:
        return
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="Dashboard!A1:F20"))

    rows = [
        [f"Bankroll ${BANKROLL}", "=IFERROR(SUM(Cards!H:H),0)"],                                 # 1
        ["Risk%",                  "=IFERROR(B1/600,0)"],                                        # 2
        ["1.5 Kelly",              "=IFERROR(SUM(Cards!S:S),0)"],                                 # 3
        ["Top30 1.5K",             '=IFERROR(SUM(LARGE(Cards!S2:S10000,ROW(INDIRECT("1:30")))),0)'],  # 4
        ["Risk/parlay",            "=IFERROR(B4/30,0)"],                                         # 5
        ["Rows",                   "=IFERROR(COUNTA(Cards!A:A)-1,0)"],                            # 6
        ["Playable Cards",         '=IFERROR(COUNTIF(Cards!H:H,">=1"),0)'],                      # 7
        ["Total Stake $1+",        '=IFERROR(SUMIF(Cards!H:H,">=1",Cards!H:H),0)'],              # 8
        ["Top30 Stake",            '=IFERROR(SUM(LARGE(Cards!H2:H10000,ROW(INDIRECT("1:30")))),0)'],  # 9
        ["Risk%",                  "=IFERROR(B8/600,0)"],                                        # 10
        ["Edge\u22650.20 Cards",   '=IFERROR(COUNTIFS(Cards!K:K,">=0.2",Cards!W:W,">=1"),0)'],     # 11
        ["Edge Kelly $",           '=IFERROR(SUMIFS(Cards!W:W,Cards!K:K,">=0.2"),0)'],           # 12
        ["Per Card",               "=IFERROR(B12/MAX(1,B11),0)"],                                # 13
        ["Edge Risk%",             "=IFERROR(B12/600,0)"],                                        # 14
        ["RECOMMENDED PLAY",       '=IFERROR(B12&" ("&B11&" cards, $"&ROUND(B13,1)&"/card) - Risk "&ROUND(B14*100,1)&"%","—")'],  # 15
        ["TOP ACTION",             '=IFERROR(IF(COUNTA(Cards!W:W)<=1,"—",INDEX(Cards!W:W,MATCH(MAX(Cards!W2:W),Cards!W:W,0))&" (Edge "&TEXT(INDEX(Cards!K:K,MATCH(MAX(Cards!W2:W),Cards!W:W,0)),"0.000")&")"),"—")'],  # 16
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="Dashboard!A1:B16",
        valueInputOption="USER_ENTERED", body={"values": rows}))

    reqs = []
    light_blue = {"red": 0.85, "green": 0.92, "blue": 1.0}
    light_gray = {"red": 0.95, "green": 0.95, "blue": 0.95}
    accent_green = {"red": 0.82, "green": 0.94, "blue": 0.82}
    reqs.append({"repeatCell": {
        "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 16,
                  "startColumnIndex": 0, "endColumnIndex": 1},
        "cell": {"userEnteredFormat": {"backgroundColor": light_blue, "textFormat": {"bold": True}}},
        "fields": "userEnteredFormat(backgroundColor,textFormat)",
    }})
    reqs.append({"repeatCell": {
        "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 16,
                  "startColumnIndex": 1, "endColumnIndex": 2},
        "cell": {"userEnteredFormat": {"backgroundColor": light_gray}},
        "fields": "userEnteredFormat.backgroundColor",
    }})
    # Currency: B1, B3, B4, B5, B8, B9, B12, B13
    for row in [0, 2, 3, 4, 7, 8, 11, 12]:
        reqs.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": row, "endRowIndex": row + 1,
                      "startColumnIndex": 1, "endColumnIndex": 2},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0.00"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
    # Percent: B2, B10, B14
    for row in [1, 9, 13]:
        reqs.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": row, "endRowIndex": row + 1,
                      "startColumnIndex": 1, "endColumnIndex": 2},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
    # Number: B6, B7, B11
    for row in [5, 6, 10]:
        reqs.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": row, "endRowIndex": row + 1,
                      "startColumnIndex": 1, "endColumnIndex": 2},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "0"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})
    # A15:B16 accent green highlight
    for row in [14, 15]:
        reqs.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": row, "endRowIndex": row + 1,
                      "startColumnIndex": 0, "endColumnIndex": 2},
            "cell": {"userEnteredFormat": {"backgroundColor": accent_green, "textFormat": {"bold": True}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)",
        }})
    reqs.append({"updateSheetProperties": {
        "properties": {"sheetId": sid, "gridProperties": {"frozenRowCount": 1}},
        "fields": "gridProperties.frozenRowCount",
    }})
    _retry(svc.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
    print("  Dashboard: A1:B16 (Bankroll, Kelly, Edge B, Recommended Play, Top Action)")


def _set_tier_filters(svc):
    for tab in ["Tier 1", "Tier 2", "Tier 3"]:
        _retry(svc.spreadsheets().values().clear(
            spreadsheetId=SPREADSHEET_ID, range=f"'{tab}'!A2:W10000"))
    # SORT(FILTER(...), 13, 1, 12, 1) = by ParlayGroup (M=13) asc, then LegID (L=12) asc — grouped legs
    data = []
    for tab, tv in [("Tier 1", "T1"), ("Tier 2", "T2"), ("Tier 3", "T3")]:
        formula = f'=IFERROR(SORT(FILTER(Cards!A2:W10000,Cards!I2:I10000="{tv}"),13,1,12,1),"")'
        data.append({"range": f"'{tab}'!A2", "values": [[formula]]})
    _retry(svc.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data}))
    print("  Tier 1/2/3 SORT(FILTER by Tier, M asc, L asc)")


def _setup_results_tracker(svc, sheets_map):
    """Results Tracker: auto-populated from Cards (A-J), ACTUAL dropdown (K), formulas (L-N), summary P:Q."""
    sid = sheets_map.get("Results Tracker")
    if sid is None:
        return
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!A1:T10000"))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!A1:N1",
        valueInputOption="RAW", body={"values": [RESULTS_HEADERS]}))
    # A2: FILTER Cards -> RunDate, Site, Slip, Player, Stat+Line, Pick, trueProb%, CardEV, ParlayGroup, LegID (10 cols)
    auto_formula = '=IFERROR(SORT(FILTER({LEFT(Cards!A2:A,10),Cards!C2:C,Cards!D2:D,Cards!E2:E,Cards!F2:F,Cards!G2:G,Cards!O2:O,Cards!K2:K,Cards!M2:M,Cards!L2:L},Cards!A2:A<>""),9,1,1,1),"")'
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!A2",
        valueInputOption="USER_ENTERED", body={"values": [[auto_formula]]}))
    # K=ACTUAL (manual dropdown), L=LegHit01, M=CardGroup, N=CardHitAll — ARRAYFORMULA so all rows fill
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!L2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=ARRAYFORMULA(IF(K2:K="HIT",1,IF(K2:K="MISS",0,"")))']]}))  # LegHit01
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!M2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=ARRAYFORMULA(I2:I)']]}))  # CardGroup = ParlayGroup (I)
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!N2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=ARRAYFORMULA(IFERROR(IF(L2:L="","",MINIFS(L:L,M:M,M2:M)),""))']]}))  # CardHitAll
    # Summary dashboard (P:Q) — ACTUAL is column K (11th)
    summary = [
        ["RESULTS SUMMARY", ""],
        ["", ""],
        ["Metric", "Value"],
        ["Total Legs", '=IFERROR(COUNTA(K2:K),0)'],
        ["Legs HIT", '=IFERROR(COUNTIF(K2:K,"HIT"),0)'],
        ["Legs MISS", '=IFERROR(COUNTIF(K2:K,"MISS"),0)'],
        ["Leg Hit %", '=IFERROR(COUNTIF(K2:K,"HIT")/COUNTA(K2:K),"")'],
        ["", ""],
        ["Total Cards (unique)", '=IFERROR(SUMPRODUCT(1/COUNTIF(M2:M,M2:M)*(M2:M<>"")),"")'],
        ["Cards HIT (all legs)", '=IFERROR(SUMPRODUCT((N2:N=1)*(ROW(N2:N)=MATCH(M2:M,M2:M,0)+1)),"")'],
        ["Card Hit %", '=IFERROR(P11/P10,"")'],
        ["", ""],
        ["PP Leg Hit %", '=IFERROR(COUNTIFS(K2:K,"HIT",B2:B,"PP")/COUNTIFS(K2:K,"<>",B2:B,"PP"),"")'],
        ["UD Leg Hit %", '=IFERROR(COUNTIFS(K2:K,"HIT",B2:B,"UD")/COUNTIFS(K2:K,"<>",B2:B,"UD"),"")'],
        ["", ""],
        ["Avg Predicted Edge", '=IFERROR(AVERAGE(G2:G),"")'],
        ["Avg CardEV (hit)", '=IFERROR(AVERAGEIF(N2:N,1,H2:H),"")'],
        ["Avg CardEV (miss)", '=IFERROR(AVERAGEIF(N2:N,0,H2:H),"")'],
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!P1:Q18",
        valueInputOption="USER_ENTERED", body={"values": summary}))
    dark_blue = {"red": 0.11, "green": 0.22, "blue": 0.45}
    white = {"red": 1.0, "green": 1.0, "blue": 1.0}
    green_bg = {"red": 0.56, "green": 0.93, "blue": 0.56}
    red_bg_r = {"red": 0.96, "green": 0.73, "blue": 0.71}
    reqs = [
        # ACTUAL column (K=10) dropdown: HIT / MISS
        {"setDataValidation": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 10, "endColumnIndex": 11},
            "rule": {"condition": {"type": "ONE_OF_LIST",
                                   "values": [{"userEnteredValue": "HIT"}, {"userEnteredValue": "MISS"}]},
                     "showCustomUi": True, "strict": True}}},
        # Header formatting
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": 14},
            "cell": {"userEnteredFormat": {
                "backgroundColor": dark_blue,
                "textFormat": {"bold": True, "foregroundColor": white}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)"}},
        {"updateSheetProperties": {
            "properties": {"sheetId": sid, "gridProperties": {"frozenRowCount": 1}},
            "fields": "gridProperties.frozenRowCount"}},
        # trueProb% (G=6) as percent
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 6, "endColumnIndex": 7},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
            "fields": "userEnteredFormat.numberFormat"}},
        # CardEV (H=7) as number
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 7, "endColumnIndex": 8},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "0.000"}}},
            "fields": "userEnteredFormat.numberFormat"}},
        # HIT = green, MISS = red on ACTUAL column (K=10)
        {"addConditionalFormatRule": {"rule": {
            "ranges": [{"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                        "startColumnIndex": 10, "endColumnIndex": 11}],
            "booleanRule": {"condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "HIT"}]},
                            "format": {"backgroundColor": green_bg}},
        }, "index": 0}},
        {"addConditionalFormatRule": {"rule": {
            "ranges": [{"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                        "startColumnIndex": 10, "endColumnIndex": 11}],
            "booleanRule": {"condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "MISS"}]},
                            "format": {"backgroundColor": red_bg_r}},
        }, "index": 1}},
        # Summary header
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 15, "endColumnIndex": 17},
            "cell": {"userEnteredFormat": {
                "backgroundColor": dark_blue,
                "textFormat": {"bold": True, "foregroundColor": white}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)"}},
    ]
    _retry(svc.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
    print("  Results Tracker: auto-populated from Cards + HIT/MISS dropdown + summary stats")


def _setup_parlay_simulator(svc, sheets_map):
    sid = sheets_map.get("Parlay Simulator")
    if sid is None:
        return
    header_data = [
        ["PARLAY SIMULATOR"], [""],
        ["Pick legs from Tier 1 to build a parlay."],
        ["Select Player in A10, Stat+Line in B10; Edge/EV auto-fill."],
        [""], ["", "", "", "", "Running", ""],
        ["#", "Player", "Stat+Line", "Edge", "EV", "Parlay EV", "LegID"], [],
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Parlay Simulator'!A1:G8",
        valueInputOption="RAW", body={"values": header_data}))
    formulas = []
    for i in range(10, 20):
        formulas.append([
            f'{i-9}', "", "",
            f'=IFERROR(VLOOKUP(B{i}&C{i},ARRAYFORMULA(\'Tier 1\'!E2:E&\'Tier 1\'!F2:F&"|"&\'Tier 1\'!J2:J),2,FALSE),"")',
            f'=IFERROR(VLOOKUP(B{i}&C{i},ARRAYFORMULA(\'Tier 1\'!E2:E&\'Tier 1\'!F2:F&"|"&\'Tier 1\'!K2:K),2,FALSE),"")',
            f'=IF(D{i}="","",SUMPRODUCT((D10:D{i}<>"")*D10:D{i}))',
            f'=IFERROR(VLOOKUP(B{i}&C{i},ARRAYFORMULA(\'Tier 1\'!E2:E&\'Tier 1\'!F2:F&"|"&\'Tier 1\'!L2:L),2,FALSE),"")',
        ])
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Parlay Simulator'!A10:G19",
        valueInputOption="USER_ENTERED", body={"values": formulas}))
    dark_blue = {"red": 0.11, "green": 0.22, "blue": 0.45}
    reqs = [
        {"setDataValidation": {"range": {"sheetId": sid, "startRowIndex": 9, "endRowIndex": 19,
                                          "startColumnIndex": 1, "endColumnIndex": 2},
                                "rule": {"condition": {"type": "ONE_OF_RANGE",
                                                       "values": [{"userEnteredValue": "='Tier 1'!E2:E500"}]},
                                         "showCustomUi": True, "strict": False}}},
        {"setDataValidation": {"range": {"sheetId": sid, "startRowIndex": 9, "endRowIndex": 19,
                                          "startColumnIndex": 2, "endColumnIndex": 3},
                                "rule": {"condition": {"type": "ONE_OF_RANGE",
                                                       "values": [{"userEnteredValue": "='Tier 1'!F2:F500"}]},
                                         "showCustomUi": True, "strict": False}}},
        {"repeatCell": {"range": {"sheetId": sid, "startRowIndex": 6, "endRowIndex": 7,
                                   "startColumnIndex": 0, "endColumnIndex": 7},
                         "cell": {"userEnteredFormat": {"textFormat": {"bold": True, "foregroundColor": {"red": 1, "green": 1, "blue": 1}},
                                                        "backgroundColor": dark_blue}},
                         "fields": "userEnteredFormat(textFormat,backgroundColor)"}},
    ]
    _retry(svc.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
    print("  Parlay Simulator: dropdowns + VLOOKUP formulas set")


def _setup_cards_hour_helper(svc, sheets_map):
    """Add HourET helper column (X) on Cards so EV Heatmap can use AVERAGEIFS. Push clears A2:W only."""
    cards_sid = sheets_map.get("Cards")
    if cards_sid is None:
        return
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="Cards!X1",
        valueInputOption="RAW", body={"values": [["HourET"]]}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="Cards!X2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=ARRAYFORMULA(IF(LEN(B2:B),HOUR(TIMEVALUE(MID(B2:B,12,8))),""))']]}))
    print("  Cards: HourET helper column X set")


def _setup_ev_heatmap(svc):
    # Use Cards!X2:X (HourET helper) so AVERAGEIFS has a proper range (no formula-as-criteria).
    header = [
        ["EV HEATMAP - Average Edge by Game Time x Tier"], [""],
        ["Auto-updates from Cards data. Rows = game-time hour (ET)."], [""],
        ["Hour (ET)", "T1 Avg Edge", "T2 Avg Edge", "T3 Avg Edge", "All Avg Edge",
         "", "T1 Cards", "T2 Cards", "T3 Cards", "Total Cards"],
    ]
    formulas = []
    for hour in range(12, 24):
        label = f"{hour}:00"
        formulas.append([label,
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!I:I,"T1",Cards!X:X,{hour}),"")',
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!I:I,"T2",Cards!X:X,{hour}),"")',
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!I:I,"T3",Cards!X:X,{hour}),"")',
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!X:X,{hour}),"")',
            "",
            f'=IFERROR(COUNTIFS(Cards!I:I,"T1",Cards!X:X,{hour}),0)',
            f'=IFERROR(COUNTIFS(Cards!I:I,"T2",Cards!X:X,{hour}),0)',
            f'=IFERROR(COUNTIFS(Cards!I:I,"T3",Cards!X:X,{hour}),0)',
            f'=IFERROR(COUNTIFS(Cards!X:X,{hour}),0)',
        ])
    formulas.append(["TOTAL",
        '=IFERROR(AVERAGEIF(Cards!I:I,"T1",Cards!J:J),"")',
        '=IFERROR(AVERAGEIF(Cards!I:I,"T2",Cards!J:J),"")',
        '=IFERROR(AVERAGEIF(Cards!I:I,"T3",Cards!J:J),"")',
        '=IFERROR(AVERAGE(Cards!J:J),"")',
        "",
        '=IFERROR(COUNTIF(Cards!I:I,"T1"),0)',
        '=IFERROR(COUNTIF(Cards!I:I,"T2"),0)',
        '=IFERROR(COUNTIF(Cards!I:I,"T3"),0)',
        '=IFERROR(COUNTA(Cards!A:A)-1,0)',
    ])
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="'EV Heatmap'!A1:J25"))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'EV Heatmap'!A1:J5",
        valueInputOption="RAW", body={"values": header}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'EV Heatmap'!A6:J19",
        valueInputOption="USER_ENTERED", body={"values": formulas}))
    print("  EV Heatmap: hourly AVERAGEIFS using Cards!X (HourET) set")


def _setup_book_comparison(svc):
    # Full comparison: stack PP (Cards) + UD (Cards) for the entered player. IFERROR avoids #REF when cols missing.
    header = [
        ["BOOK COMPARISON - PP vs UD for same player"], [""],
        ["Enter player name in B4 to compare across books:"],
        ["Player:", "", "", "", "", "", "", "", ""], [""],
        ["Site", "Player", "Stat+Line", "Pick", "Tier", "AvgEdge%", "trueProb%", "underOdds", "overOdds", "CardEV", "KellyStake$"],
    ]
    # FILTER by Player (E)=B4; wrap in IFERROR to avoid #REF from spill or missing data
    formula_row = [
        '=IFERROR(IF(B4="","",FILTER({Cards!C2:C,Cards!E2:E,Cards!F2:F,Cards!G2:G,Cards!I2:I,Cards!J2:J,Cards!O2:O,Cards!P2:P,Cards!Q2:Q,Cards!K2:K,Cards!H2:H},Cards!E2:E=B4)),"")'
    ]
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="'Book Comparison'!A1:K500"))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Book Comparison'!A1:K6",
        valueInputOption="RAW", body={"values": header}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Book Comparison'!A7",
        valueInputOption="USER_ENTERED", body={"values": [formula_row]}))
    # Summary stats below player comparison
    summary_start = 30
    summary = [
        ["OVERALL BOOK SUMMARY"], [""],
        ["Metric", "PP", "UD"],
        ["Total Legs", '=COUNTIF(Cards!C2:C,"PP")', '=COUNTIF(Cards!C2:C,"UD")'],
        ["Avg Edge%", '=IFERROR(AVERAGEIF(Cards!C2:C,"PP",Cards!J2:J),"")', '=IFERROR(AVERAGEIF(Cards!C2:C,"UD",Cards!J2:J),"")'],
        ["Avg trueProb%", '=IFERROR(AVERAGEIF(Cards!C2:C,"PP",Cards!O2:O),"")', '=IFERROR(AVERAGEIF(Cards!C2:C,"UD",Cards!O2:O),"")'],
        ["T1 Cards", '=COUNTIFS(Cards!C2:C,"PP",Cards!I2:I,"T1")', '=COUNTIFS(Cards!C2:C,"UD",Cards!I2:I,"T1")'],
        ["T2 Cards", '=COUNTIFS(Cards!C2:C,"PP",Cards!I2:I,"T2")', '=COUNTIFS(Cards!C2:C,"UD",Cards!I2:I,"T2")'],
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range=f"'Book Comparison'!A{summary_start}:C{summary_start + len(summary) - 1}",
        valueInputOption="USER_ENTERED", body={"values": summary}))
    print("  Book Comparison: PP vs UD FILTER + summary stats")


def main():
    print("=== sheets_setup_9tab.py (A-W, 23 cols, 11 tabs) ===")
    svc = get_service()

    sheets_map = _get_sheets(svc)
    print(f"  Existing tabs: {list(sheets_map.keys())}")

    _delete_tabs(svc, sheets_map)
    sheets_map = _get_sheets(svc)

    _create_missing_tabs(svc, sheets_map)
    sheets_map = _get_sheets(svc)

    _write_headers(svc)
    _set_legs_ud_formulas(svc)

    _clear_conditional_formats(svc)
    _apply_formatting(svc, sheets_map)
    _setup_cards_hour_helper(svc, sheets_map)
    _set_tier_filters(svc)
    _setup_parlay_simulator(svc, sheets_map)
    _setup_ev_heatmap(svc)
    _setup_book_comparison(svc)
    _setup_dashboard_tab(svc, sheets_map)
    _setup_results_tracker(svc, sheets_map)

    print(f"\n  11-tab system ready: {REQUIRED_TABS}")
    print("  Run generate:production to push data.")


if __name__ == "__main__":
    main()
