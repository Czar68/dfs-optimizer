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
    "RunTimestamp", "RunPeriod", "GameTime", "Player", "Stat+Line",
    "LegID", "Pred Edge%", "Pred CardEV", "ACTUAL", "LegHit",
    "CardGroup", "CardHit", "CSV Export",
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
        # Parlay color bands A–M (through ParlayGroup) by MOD(M,4)+1 — 5–8 row blocks per card, easy to tell apart
        band_blue = {"red": 0.87, "green": 0.92, "blue": 1.0}
        band_orange = {"red": 1.0, "green": 0.92, "blue": 0.80}
        band_purple = {"red": 0.90, "green": 0.85, "blue": 0.95}
        band_green = {"red": 0.85, "green": 0.95, "blue": 0.85}
        for formula, color in [
            ("=MOD(M2,4)+1=1", band_blue),
            ("=MOD(M2,4)+1=2", band_orange),
            ("=MOD(M2,4)+1=3", band_purple),
            ("=MOD(M2,4)+1=4", band_green),
        ]:
            r.append({"addConditionalFormatRule": {"rule": {
                "ranges": [{"sheetId": sid, "startRowIndex": ds, "endRowIndex": 10000,
                            "startColumnIndex": 0, "endColumnIndex": 14}],
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
        [f"Bankroll ${BANKROLL}", "=SUM(Cards!H:H)"],                                          # 1
        ["Risk%",                  "=IFERROR(B1/600,0)"],                                       # 2
        ["1.5 Kelly",              "=SUM(Cards!S:S)"],                                          # 3
        ["Top30 1.5K",             '=SUM(LARGE(Cards!S2:S10000,ROW(INDIRECT("1:30"))))'],       # 4
        ["Risk/parlay",            "=IFERROR(B4/30,0)"],                                        # 5
        ["Rows",                   "=COUNTA(Cards!A:A)-1"],                                     # 6
        ["Playable Cards",         '=COUNTIF(Cards!H:H,">=1")'],                                # 7
        ["Total Stake $1+",        '=SUMIF(Cards!H:H,">=1",Cards!H:H)'],                        # 8
        ["Top30 Stake",            '=SUM(LARGE(Cards!H2:H10000,ROW(INDIRECT("1:30"))))'],       # 9
        ["Risk%",                  "=IFERROR(B8/600,0)"],                                       # 10
        ["Edge\u22650.20 Cards",   '=COUNTIFS(Cards!K:K,">=0.2",Cards!W:W,">=1")'],             # 11
        ["Edge Kelly $",           '=SUMIFS(Cards!W:W,Cards!K:K,">=0.2")'],                     # 12
        ["Per Card",               "=IFERROR(B12/B11,0)"],                                      # 13
        ["Edge Risk%",             "=IFERROR(B12/600,0)"],                                      # 14
        ["RECOMMENDED PLAY",       '=IFERROR(B12&" ("&B11&" cards, $"&ROUND(B13,1)&"/card) - Risk "&ROUND(B14*100,1)&"%","—")'],  # 15
        ["TOP ACTION",             '=IFERROR(INDEX(Cards!W:W,MATCH(MAX(Cards!W:W),Cards!W:W,0))&" (Edge "&TEXT(INDEX(Cards!K:K,MATCH(MAX(Cards!W:W),Cards!W:W,0)),"0.000")&")","—")'],  # 16
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
    sid = sheets_map.get("Results Tracker")
    if sid is None:
        return
    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!A1:Q10000"))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!A1:M1",
        valueInputOption="RAW", body={"values": [RESULTS_HEADERS]}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!J2:L2",
        valueInputOption="USER_ENTERED",
        body={"values": [['=IF(I2="HIT",1,IF(I2="MISS",0,""))', "", '=IFERROR(AVERAGEIFS(J:J,K:K,K2),"")']]}))
    metrics = [
        ["Metric", "Value"],
        ["Legs Tracked", '=COUNTA(I2:I)'],
        ["Leg Hit Rate", '=IFERROR(AVERAGE(J2:J),"")'],
        ["Card Hit Rate", '=IFERROR(AVERAGE(L2:L),"")'],
        ["Edge Accuracy", '=IFERROR(CORREL(G2:G,J2:J),"")'],
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!O1:P5",
        valueInputOption="USER_ENTERED", body={"values": metrics}))
    window_data = [
        ["Window", "Avg CardEV", "Leg Hit%"],
        ["7AM",  '=IFERROR(AVERAGEIF(B:B,"7AM",H:H),"")',  '=IFERROR(AVERAGEIF(B:B,"7AM",J:J),"")'],
        ["Noon", '=IFERROR(AVERAGEIF(B:B,"Noon",H:H),"")', '=IFERROR(AVERAGEIF(B:B,"Noon",J:J),"")'],
        ["5PM",  '=IFERROR(AVERAGEIF(B:B,"5PM",H:H),"")',  '=IFERROR(AVERAGEIF(B:B,"5PM",J:J),"")'],
        ["10PM", '=IFERROR(AVERAGEIF(B:B,"10PM",H:H),"")', '=IFERROR(AVERAGEIF(B:B,"10PM",J:J),"")'],
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Results Tracker'!O7:Q11",
        valueInputOption="USER_ENTERED", body={"values": window_data}))
    dark_blue = {"red": 0.11, "green": 0.22, "blue": 0.45}
    white = {"red": 1.0, "green": 1.0, "blue": 1.0}
    reqs = [
        {"setDataValidation": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 8, "endColumnIndex": 9},
            "rule": {"condition": {"type": "ONE_OF_LIST",
                                   "values": [{"userEnteredValue": "HIT"}, {"userEnteredValue": "MISS"}]},
                     "showCustomUi": True, "strict": True}}},
        {"setDataValidation": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 1, "endColumnIndex": 2},
            "rule": {"condition": {"type": "ONE_OF_LIST",
                                   "values": [{"userEnteredValue": "7AM"}, {"userEnteredValue": "Noon"},
                                              {"userEnteredValue": "5PM"}, {"userEnteredValue": "10PM"}]},
                     "showCustomUi": True, "strict": False}}},
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": 13},
            "cell": {"userEnteredFormat": {
                "backgroundColor": dark_blue,
                "textFormat": {"bold": True, "foregroundColor": white}}},
            "fields": "userEnteredFormat(backgroundColor,textFormat)"}},
        {"updateSheetProperties": {
            "properties": {"sheetId": sid, "gridProperties": {"frozenRowCount": 1}},
            "fields": "gridProperties.frozenRowCount"}},
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 6, "endColumnIndex": 7},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
            "fields": "userEnteredFormat.numberFormat"}},
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 10000,
                      "startColumnIndex": 7, "endColumnIndex": 8},
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "0.000"}}},
            "fields": "userEnteredFormat.numberFormat"}},
    ]
    _retry(svc.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body={"requests": reqs}))
    print("  Results Tracker: headers, dropdowns, formulas")


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


def _setup_ev_heatmap(svc):
    header = [
        ["EV HEATMAP - Average Edge by Game Time x Tier"], [""],
        ["Auto-updates from Cards data."], [""],
        ["GameTime", "T1 Avg Edge", "T2 Avg Edge", "T3 Avg Edge", "All Avg Edge"],
    ]
    formulas = []
    for hour in range(12, 24):
        h, hn = f"{hour}:00", f"{hour+1}:00" if hour < 23 else "24:00"
        formulas.append([h,
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!I:I,"T1",Cards!B:B,">="&TIMEVALUE("{h}"),Cards!B:B,"<"&TIMEVALUE("{hn}")),"")',
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!I:I,"T2",Cards!B:B,">="&TIMEVALUE("{h}"),Cards!B:B,"<"&TIMEVALUE("{hn}")),"")',
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!I:I,"T3",Cards!B:B,">="&TIMEVALUE("{h}"),Cards!B:B,"<"&TIMEVALUE("{hn}")),"")',
            f'=IFERROR(AVERAGEIFS(Cards!J:J,Cards!B:B,">="&TIMEVALUE("{h}"),Cards!B:B,"<"&TIMEVALUE("{hn}")),"")',
        ])
    formulas.append(["TOTAL",
        '=IFERROR(AVERAGEIF(Cards!I:I,"T1",Cards!J:J),"")',
        '=IFERROR(AVERAGEIF(Cards!I:I,"T2",Cards!J:J),"")',
        '=IFERROR(AVERAGEIF(Cards!I:I,"T3",Cards!J:J),"")',
        '=IFERROR(AVERAGE(Cards!J2:J),"")'])
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'EV Heatmap'!A1:E5",
        valueInputOption="RAW", body={"values": header}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'EV Heatmap'!A6:E19",
        valueInputOption="USER_ENTERED", body={"values": formulas}))
    print("  EV Heatmap: hourly AVERAGEIFS formulas set")


def _setup_book_comparison(svc):
    header = [
        ["BOOK COMPARISON - Same player across PP vs UD"], [""],
        ["Enter player name in B4 to compare:"],
        ["Player:", "", "", "", "", ""], [""],
        ["Site", "Player", "Stat+Line", "Tier", "AvgEdge%", "CardEV", "underOdds", "overOdds", "LegID"],
    ]
    formula_row = [
        '=IFERROR(FILTER({Legs!C2:C,Legs!E2:E,Legs!F2:F,Legs!I2:I,Legs!J2:J,Legs!K2:K,Legs!P2:P,Legs!Q2:Q,Legs!L2:L},Legs!E2:E=B4),"")'
    ]
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Book Comparison'!A1:I6",
        valueInputOption="RAW", body={"values": header}))
    _retry(svc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range="'Book Comparison'!A7",
        valueInputOption="USER_ENTERED", body={"values": [formula_row]}))
    print("  Book Comparison: FILTER formula set")


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
