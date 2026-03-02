# sheets_push_cards.py -- PP + UD cards -> Cards tab (A-W, 23 cols)
#
# A RunTime  B GameTime  C Site  D Slip  E Player  F Stat+Line
# G Pick  H KellyStake$  I Tier  J AvgEdge%  K CardEV  L LegID
# M ParlayGroup  N AvgProb%  O trueProb%  P underOdds  Q overOdds
# R EV  S 1.5Kelly  T DeepLink  U LastRun  V Notes  W CardKelly$
#
# Row 1 = Headers (from setup), Row 2+ = Data.
# DeepLink T = per-row LegID only: UD ?legs=L2, PP /entry/L2 (page opens with leg preselected).
# CardKelly$ = per-card stake (first row only, x3 multiplier).

import argparse, csv, json, math, os, time
from collections import Counter
from datetime import datetime

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"
PP_CSV         = "prizepicks-cards.csv"
UD_CSV         = "underdog-cards.csv"
PP_LEGS_CSV    = "prizepicks-legs.csv"
UD_LEGS_CSV    = "underdog-legs.csv"
RETRIES        = 5
RETRY_DELAY    = 2.0

BANKROLL       = 600
KELLY_MAX_PCT  = 0.01
KELLY_MAX_BET  = 25.0
KELLY_MIN_STAKE = 1.0
CARD_KELLY_MULT = 3

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

def _tier_from_ev(card_ev):
    if card_ev >= 0.08: return "T1"
    if card_ev >= 0.04: return "T2"
    return "T3"

def _safe_float(v, default=0.0):
    try: return float(v)
    except (TypeError, ValueError): return default

def _kelly_stake(avg_edge_dec, over_odds_str, bankroll=BANKROLL):
    if avg_edge_dec <= 0:
        return KELLY_MIN_STAKE
    try:
        american = float(over_odds_str)
    except (TypeError, ValueError):
        return KELLY_MIN_STAKE
    if not math.isfinite(american) or abs(american) < 100:
        return KELLY_MIN_STAKE
    kelly = bankroll * avg_edge_dec / abs(american)
    raw = min(KELLY_MAX_PCT * bankroll, kelly, KELLY_MAX_BET)
    return round(max(KELLY_MIN_STAKE, raw), 2)

def _pick_direction(over_odds, under_odds):
    return "\U0001f7e2 OVER"

def _retry(request):
    for attempt in range(RETRIES):
        try: return request.execute()
        except HttpError as e:
            status = getattr(getattr(e, "resp", None), "status", 0)
            if status in (429, 500, 502, 503) and attempt < RETRIES - 1:
                time.sleep(RETRY_DELAY * (2 ** attempt)); continue
            raise

def _get_cards_sheet_id(svc):
    meta = _retry(svc.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets(properties(title,sheetId))"))
    for s in meta.get("sheets", []):
        if s["properties"]["title"] == "Cards":
            return s["properties"]["sheetId"]
    return None

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


def _load_legs_lookup():
    lookup = {}
    for csv_path in [PP_LEGS_CSV, UD_LEGS_CSV]:
        if not os.path.exists(csv_path):
            continue
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                lid = row.get("id", "").strip()
                if not lid:
                    continue
                lookup[lid] = {
                    "player":    row.get("player", "").strip(),
                    "stat":      row.get("stat", "").strip(),
                    "line":      row.get("line", "").strip(),
                    "trueProb":  row.get("trueProb", ""),
                    "edge":      row.get("edge", ""),
                    "legEv":     row.get("legEv", ""),
                    "overOdds":  row.get("overOdds", ""),
                    "underOdds": row.get("underOdds", ""),
                    "gameTime":  row.get("gameTime", ""),
                }
    return lookup


def _parse_leg_id(leg_id):
    parts = leg_id.split("-")
    if len(parts) >= 4:
        return parts[-2], parts[-1]
    return "", ""


def _expected_leg_count(slip):
    """Return expected number of legs for slip (e.g. 6P/6F -> 6), or 0 if unknown."""
    if not slip or len(slip) < 2:
        return 0
    try:
        n = int("".join(c for c in slip if c.isdigit()))
        return n if 2 <= n <= 8 else 0
    except ValueError:
        return 0


def _build_card_rows(csv_path, site_default, legs_lookup, start_card_index, bankroll=BANKROLL):
    if not os.path.exists(csv_path):
        print(f"  WARNING: {csv_path} not found")
        return [], start_card_index

    rows = []
    card_index = start_card_index
    with open(csv_path, newline="", encoding="utf-8") as f:
        for card_row in csv.DictReader(f):
            if not any(card_row.values()):
                continue

            run_ts   = card_row.get("runTimestamp", "")
            site     = card_row.get("site", site_default)
            slip     = card_row.get("flexType", "")
            leg_keys = [f"leg{i}Id" for i in range(1, 9)]
            leg_ids = [card_row.get(k, "").strip() for k in leg_keys]
            leg_ids = [lid for lid in leg_ids if lid]
            # Skip cards where leg count doesn't match slip (e.g. 6P with only 5 legs) so sheet never shows mismatch
            expected = _expected_leg_count(slip)
            if expected and len(leg_ids) != expected:
                print(f"  Skipping card {slip} with {len(leg_ids)} legs (expected {expected})")
                continue

            card_id = card_index
            # M = unique card id so all legs of same card group together; sort M asc, L asc
            parlay_group_id = card_id
            card_index += 1

            card_ev  = _safe_float(card_row.get("cardEv", "0"))
            avg_edge = _safe_float(card_row.get("avgEdgePct", "0"))
            avg_prob = _safe_float(card_row.get("avgProb", "0"))
            tier     = _tier_from_ev(card_ev)
            edge_dec = avg_edge / 100 if avg_edge > 1 else avg_edge

            for lid in leg_ids:
                leg = legs_lookup.get(lid, {})
                player     = leg.get("player", "")
                stat       = leg.get("stat", "")
                line       = leg.get("line", "")
                game_time  = leg.get("gameTime", "")
                true_prob  = _safe_float(leg.get("trueProb", "0"))
                edge       = _safe_float(leg.get("edge", "0"))
                leg_ev     = _safe_float(leg.get("legEv", "0"))
                over_odds  = leg.get("overOdds", "")
                under_odds = leg.get("underOdds", "")

                if not player:
                    parsed_stat, parsed_line = _parse_leg_id(lid)
                    stat = stat or parsed_stat
                    line = line or parsed_line

                stat_line = f"{_stat_label(stat)} {line}" if stat else ""
                kelly = _kelly_stake(edge_dec, over_odds, bankroll)
                pick = _pick_direction(over_odds, under_odds)
                kelly_15 = round(kelly * 1.5, 2)

                rows.append([
                    run_ts,            # 0  A  RunTime
                    game_time,         # 1  B  GameTime
                    site,              # 2  C  Site
                    slip,              # 3  D  Slip
                    player,            # 4  E  Player
                    stat_line,         # 5  F  Stat+Line
                    pick,              # 6  G  Pick
                    kelly,             # 7  H  KellyStake$
                    tier,              # 8  I  Tier
                    edge_dec,          # 9  J  AvgEdge%
                    card_ev,           # 10 K  CardEV
                    lid,               # 11 L  LegID
                    parlay_group_id,   # 12 M  ParlayGroup
                    avg_prob,          # 13 N  AvgProb%
                    true_prob,         # 14 O  trueProb%
                    under_odds,        # 15 P  underOdds
                    over_odds,         # 16 Q  overOdds
                    leg_ev,            # 17 R  EV
                    kelly_15,          # 18 S  1.5Kelly
                    "",                # 19 T  DeepLink (placeholder, filled by main)
                    card_id,           # 20    temp sort key — stripped before write
                ])

    return rows, card_index


def _enrich_cards(combined):
    """Post-sort: CardKelly$ (first row of each card only). DeepLink is per-row L2 formula (set in main)."""
    card_kelly_list = []
    i = 0
    while i < len(combined):
        cid = combined[i][20]
        j = i
        while j < len(combined) and combined[j][20] == cid:
            j += 1
        group = combined[i:j]
        kelly_sum = sum(r[7] for r in group)
        ck = round(max(1.0, kelly_sum * CARD_KELLY_MULT), 2)
        for k in range(len(group)):
            card_kelly_list.append(ck if k == 0 else "")
        i = j
    return card_kelly_list


def _parlay_group_diagnostic(combined, rows_show=20):
    """Rows 2–N: M (ParlayGroup) values; unique M count vs total rows; avg legs/card."""
    if not combined:
        return
    m_vals = [r[12] for r in combined[:rows_show]]
    unique_m = len(set(r[12] for r in combined))
    total = len(combined)
    legs_per_card = []
    i = 0
    while i < len(combined):
        cid = combined[i][20]
        j = i
        while j < len(combined) and combined[j][20] == cid:
            j += 1
        legs_per_card.append(j - i)
        i = j
    avg_legs = sum(legs_per_card) / len(legs_per_card) if legs_per_card else 0
    print("\n  --- PARLAY GROUP (M) DIAGNOSTIC ---")
    print(f"  Rows 2–{1+rows_show}: M = {m_vals}")
    print(f"  Unique ParlayGroup (M): {unique_m}  |  Total rows: {total}  |  Avg legs/card: {avg_legs:.1f}")
    print("  --- END PARLAY DIAGNOSTIC ---\n")

def _diagnostic(combined, card_kelly_list, cap=100):
    print("\n  --- PICK / ODDS / CARDKELLY DIAGNOSTIC ---")
    sample = combined[:min(10, len(combined))]
    print("  First 10 rows: P(under) / Q(over) / Pick(G)")
    for i, r in enumerate(sample):
        print(f"    row {i+2}: P={r[15]}  Q={r[16]}  Pick={r[6]}")

    ud = [r for r in combined if r[2] == "UD"]
    pp = [r for r in combined if r[2] == "PP"]
    def pct(rows):
        if not rows: return 0, 0
        o = sum(1 for r in rows if "\U0001f7e2" in r[6])
        u = sum(1 for r in rows if "\U0001f534" in r[6])
        n = len(rows)
        return 100 * o / n, 100 * u / n
    o_ud, u_ud = pct(ud[:cap])
    o_pp, u_pp = pct(pp[:cap])
    print(f"  UD: OVER={o_ud:.0f}% UNDER={u_ud:.0f}%  |  PP: OVER={o_pp:.0f}% UNDER={u_pp:.0f}%")

    ck_vals = [v for v in card_kelly_list if isinstance(v, (int, float)) and v > 0]
    if ck_vals:
        print(f"  CardKelly$: {len(ck_vals)} cards  ${min(ck_vals):.2f}–${max(ck_vals):.2f}  Total=${sum(ck_vals):.2f}")
        edge_b = [v for v, r in zip(card_kelly_list, combined) if isinstance(v, (int, float)) and v >= 1 and r[10] >= 0.20]
        print(f"  Edge B (CardEV>=0.20 & CardKelly>=1): {len(edge_b)} cards  ${sum(edge_b):.2f}")

    print("  Sample 5 UD cards: Player | legs | Q(over) | P(under) | CardKelly$")
    shown = 0
    for idx, r in enumerate(ud[:cap]):
        ck = card_kelly_list[combined.index(r)] if r in combined else ""
        if ck != "":
            print(f"    {r[4]} | Q={r[16]} | P={r[15]} | CK=${ck}")
            shown += 1
            if shown >= 5:
                break
    print("  --- END DIAGNOSTIC ---\n")


def main(dry_run=False, bankroll=BANKROLL):
    print("=== sheets_push_cards.py (A-W, 23 cols: CardKelly$ W, DeepLink T=LegID only) ===")

    legs_lookup = _load_legs_lookup()
    print(f"  Legs lookup: {len(legs_lookup)} entries")

    pp_rows, idx = _build_card_rows(PP_CSV, "PP", legs_lookup, 0, bankroll)
    ud_rows, _   = _build_card_rows(UD_CSV, "UD", legs_lookup, idx, bankroll)
    combined = pp_rows + ud_rows
    combined.sort(key=lambda r: (r[20], r[1]))
    # Drop rows with all of A–F empty so we never write a blank row 2
    combined = [r for r in combined if any(r[i] not in (None, "") for i in range(6))]
    if not combined:
        print("  No card rows after filtering; nothing to push.")
        return

    card_kelly_list = _enrich_cards(combined)

    pp_count = sum(1 for r in combined if r[2] == "PP")
    ud_count = sum(1 for r in combined if r[2] == "UD")
    print(f"  PP: {pp_count}  UD: {ud_count}  Total: {len(combined)}")

    kelly_vals = [r[7] for r in combined if r[7] > 0]
    ck_vals = [v for v in card_kelly_list if isinstance(v, (int, float)) and v > 0]
    if kelly_vals:
        top50 = sum(sorted(kelly_vals, reverse=True)[:50])
        print(f"  KellyStake$: ${min(kelly_vals):.2f}–${max(kelly_vals):.2f} | Top50=${top50:.2f}")
    if ck_vals:
        top30 = sum(sorted(ck_vals, reverse=True)[:30])
        print(f"  CardKelly$: ${min(ck_vals):.2f}–${max(ck_vals):.2f} | {len(ck_vals)} cards | Top30=${top30:.2f}")

    _diagnostic(combined, card_kelly_list, cap=100)
    _parlay_group_diagnostic(combined)

    if dry_run:
        print("  Dry run — no writes.")
        return

    svc = get_service()
    push_time = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Build final rows: A-S (19 cols), T = DeepLink formula, U LastRun, V Notes, W = CardKelly$ first-row-only formula
    # W: =IF(ROW()=MINIFS(ROW(M:M),M:M,M2),MAX(1,SUMIFS(H:H,M:M,M2)*3),"")
    final_rows = []
    for idx, row in enumerate(combined):
        r = idx + 2  # sheet row number
        deep_formula = (
            f'=IF(C{r}="UD",'
            f'HYPERLINK("https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA?legs="&L{r},"\U0001f4f1 UD "&M{r}),'
            f'HYPERLINK("https://app.prizepicks.com/entry/"&L{r},"\U0001f4f1 PP "&M{r}))'
        )
        w_formula = f'=IF(ROW()=MINIFS(ROW(M:M),M:M,M{r}),MAX(1,SUMIFS(H:H,M:M,M{r})*3),"")'
        final_rows.append(row[:19] + [deep_formula, push_time, "", w_formula])

    _retry(svc.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID, range="Cards!A2:W"))

    if final_rows:
        _retry(svc.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID, range="Cards!A2",
            valueInputOption="USER_ENTERED", body={"values": final_rows}))

        # Sort Cards A2:W by ParlayGroup (M=12) ascending, then LegID (L=11) ascending — legs per card together
        cards_sid = _get_cards_sheet_id(svc)
        if cards_sid is not None:
            _retry(svc.spreadsheets().batchUpdate(
                spreadsheetId=SPREADSHEET_ID, body={"requests": [{
                    "sortRange": {
                        "range": {
                            "sheetId": cards_sid,
                            "startRowIndex": 1,
                            "endRowIndex": 1 + len(final_rows),
                            "startColumnIndex": 0,
                            "endColumnIndex": 23,
                        },
                        "sortSpecs": [
                            {"dimensionIndex": 12, "sortOrder": "ASCENDING"},   # M ParlayGroup
                            {"dimensionIndex": 11, "sortOrder": "ASCENDING"},   # L LegID
                        ],
                    }
                }]}))
            print("  Sorted Cards by ParlayGroup (M) asc, LegID (L) asc")

    print(f"  Pushed {len(final_rows)} rows -> Cards!A2:W (T=LegID deeplink) | LastRun={push_time}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--bankroll", type=float, default=None)
    parser.add_argument("--force-refresh", action="store_true")
    args = parser.parse_args()
    main(dry_run=args.dry_run, bankroll=args.bankroll or BANKROLL)
