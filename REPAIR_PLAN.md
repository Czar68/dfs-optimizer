# Repair Plan: Underdog Pipeline, Cards Sheet, Calculator Tab

## 1. Schema Contract

### Legs Sheet (`Legs!A1:Q`)
The canonical source of truth for all props (PrizePicks + Underdog).

| Col | Header        | Type    | Example                                  | Required for UD |
|-----|---------------|---------|------------------------------------------|-----------------|
| A   | id            | string  | `prizepicks-9800851-rebounds-6`           | YES – use `underdog-{projId}-{stat}-{line}` |
| B   | player        | string  | `LeBron James`                           | YES |
| C   | team          | string  | `LAL`                                    | YES |
| D   | stat          | string  | `rebounds`                               | YES |
| E   | line          | number  | `6`                                      | YES |
| F   | league        | string  | `NBA`                                    | YES |
| G   | book          | string  | `draftkings`                             | YES |
| H   | overOdds      | number  | `-149`                                   | YES |
| I   | underOdds     | number  | `113`                                    | YES |
| J   | trueProb      | decimal | `0.5603580698130197`                     | YES |
| K   | edge          | decimal | `0.06035806981301972`                    | YES |
| L   | legEv         | decimal | `0.06035806981301972`                    | YES |
| M   | runTimestamp   | string  | `2026-02-09T14:35:07 ET`                 | YES |
| N   | gameTime      | ISO8601 | `2026-02-09T22:10:00.000-05:00`          | YES |
| O   | IsWithin24h   | bool    | `TRUE`                                   | YES |
| P   | (blank)       | –       | –                                        | – |
| Q   | Leg_Text      | formula | `LeBron James – rebounds 6` (row 1 header, formula in data rows) | Auto |

### Cards_Data Sheet (`Cards_Data!A1:N`) — raw push target
Populated by `sheets_push_cards.py`. No formulas; pure values.

| Col | Header       | Source field    |
|-----|-------------|-----------------|
| A   | Date        | runTimestamp     |
| B   | Card_ID     | site (PP / UD)  |
| C   | Slip        | flexType        |
| D   | Legs        | count of non-empty leg IDs |
| E   | Leg1_ID     | leg1Id          |
| F   | Leg2_ID     | leg2Id          |
| G   | Leg3_ID     | leg3Id          |
| H   | Leg4_ID     | leg4Id          |
| I   | Leg5_ID     | leg5Id          |
| J   | Leg6_ID     | leg6Id          |
| K   | AvgProb     | avgProb         |
| L   | AvgEdge%    | avgEdgePct      |
| M   | CardEV%     | cardEv          |
| N   | WinProbCash | winProbCash     |

### Cards Sheet (`Cards!A1:AH`) — display with ARRAYFORMULA
- **A–J**: ARRAYFORMULA in row 2, plain text headers in row 1. References Cards_Data.
- **K–N**: ARRAYFORMULA in row 1 (header + data combined). References Cards_Data.
- **O–V**: Manual columns (Strength, KellyStake, PlayerBlock, Kelly Fraction, etc.)
- **W–AB**: ARRAYFORMULA Leg_Text columns (VLOOKUP to Legs by ID).
- **AC–AH**: Kelly/risk columns (DailyRiskFraction, TotalKellyRaw, ScalingFactor, etc.)

### Calculator Sheet
- **Row 1**: Headers `[Date, Leg1_ID, ..., Leg6_ID, Kelly]`
- **Row 2**: Input card IDs + bankroll
- **Row 3**: `trueProb` — INDEX/MATCH from `Legs!$J` by ID in row 2
- **Row 4**: `edge` — INDEX/MATCH from `Legs!$K` by ID in row 2
- **Row 5**: `Name` — INDEX/MATCH from `Legs!$B` + stat + line
- **Row 7**: `Avg trueProb` — AVERAGE of non-empty legs in row 3
- **Row 8**: `Avg edge%` — AVERAGE of non-empty legs in row 4
- **Rows 10–19**: Slip summary (2P,3P,3F,4P,4F,5P,5F,6P,6F) with AvgProb, LegMargin%, EV, ROI%
- **Rows 22–24**: Best Slip / Best ROI% / Best LegMargin%
- **H column**: Kelly side-panel (EV, ROI, payout odds, Kelly fraction, dollar stake)

### Engine Sheet
- **Rows 1–6**: Payout tables (Power: 2P=3x,3P=6x,4P=10x,5P=20x,6P=37.5x; Flex: with k-1 tier)
- **Rows 8–15**: Card input (linked to Cards_Data first card)
- **Rows 17–23**: Slot lookup (trueProb/edge from Legs via IFERROR INDEX/MATCH)
- **Row 45–46**: Break-even probabilities (`p_be`) per slip type
- **Row 50–52**: AvgProb / LegMargin% computation
- **Rows 60–150**: Binomial distribution models per slip (2P,3P,3F,4P,4F,5P,5F,6P,6F)

### Contract Summary
> **Legs!A:Q** is the canonical legs table.  
> **Cards_Data!A:N** stores raw card rows pushed by Python.  
> **Cards!A:AH** references Cards_Data via ARRAYFORMULA and Legs via VLOOKUP.  
> **Calculator!B2:G2** expects leg IDs; rows 3–5 pull trueProb/edge/Name from Legs via INDEX+MATCH on `Legs!$A`.  
> **Engine** pulls slot IDs from Cards_Data and looks up trueProb/edge from Legs; binomial models compute EV/ROI per slip.

---

## 2. Underdog → Legs Mapping

### TypeScript Interface

```typescript
// Canonical leg shape — identical for PrizePicks and Underdog
interface CanonicalLeg {
  id: string;           // "underdog-{projectionId}-{stat}-{line}"
  player: string;       // "LeBron James"
  team: string;         // "LAL"
  stat: string;         // "rebounds"
  line: number;         // 6
  league: string;       // "NBA"
  book: string;         // best-match sportsbook from SGO
  overOdds: number;     // American odds, e.g. -149
  underOdds: number;    // American odds, e.g. 113
  trueProb: number;     // devigged probability, e.g. 0.5604
  edge: number;         // trueProb - 0.5
  legEv: number;        // same as edge for ranking
  runTimestamp: string;  // "2026-02-09T14:35:07 ET"
  gameTime: string;     // ISO 8601 game start time
  IsWithin24h: string;  // "TRUE" or "FALSE"
}
```

### ID Convention
- **PrizePicks**: `prizepicks-{projectionId}-{stat}-{line}` (e.g., `prizepicks-9800851-rebounds-6`)
- **Underdog**: `underdog-{projectionId}-{stat}-{line}` (e.g., `underdog-482716-points-22.5`)

Generated in `calculate_ev.ts` line 15: `const id = \`${pick.site}-${pick.projectionId}-${pick.stat}-${pick.line}\``

Since `pick.site` is `"underdog"`, the ID automatically uses the `underdog-` prefix. No code change needed for ID generation.

### Normalization Notes
1. Odds → trueProb: Underdog props go through the same `mergeOddsWithProps()` → `devigTwoWay()` pipeline as PrizePicks. The SGO fetch provides book odds; devigging produces `trueProb`.
2. Edge: `trueProb - 0.5` (same formula for both sites).
3. The downstream Sheets formulas need NO separate code path — as long as the Legs CSV columns match, Sheets treats both identically.

### Current Bug: Why Underdog produces 0 legs
The `run_underdog_optimizer.ts` writes the legs CSV with different columns than the PrizePicks format:

**PrizePicks legs CSV** (what Legs sheet expects):
```
id,player,team,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h
```

**Underdog legs CSV** (current broken format):
```
site,league,player,team,opponent,stat,line,projectionId,gameId,startTime,outcome,trueProb,fairOdds,edge,book,overOdds,underOdds,legEv,runTimestamp
```

Missing: `id` (column A), `gameTime`, `IsWithin24h`. Extra: `site`, `outcome`, `fairOdds`, `projectionId`, `gameId`, `startTime`.

Additionally, the Underdog API endpoint (`/beta/v5/games`) likely returns a different JSON shape than expected, causing 0 raw props → 0 merged → 0 cards. Even when it works, the CSV schema mismatch means the UD-Legs sheet is incompatible with Calculator lookups.

---

## 3. Cards Sheet K10:N10 — Root Cause & Fix

### Root Cause
The ARRAYFORMULA in K1 (and L1, M1, N1) has an **off-by-one alignment bug**:

```
K1: =ARRAYFORMULA(IF(ROW(A:A)=1,"AvgProb",Cards_Data!K2:K))
```

`ROW(A:A)` produces `{1, 2, 3, ...}`. `Cards_Data!K2:K` produces `{K2, K3, K4, ...}`.

ARRAYFORMULA aligns element-by-element:
- **Position 1** (Row 1): IF(1=1, "AvgProb", K2) → "AvgProb" ✓
- **Position 2** (Row 2): IF(2=1, "AvgProb", **K3**) → K3 ← **WRONG, should be K2**
- **Position 9** (Row 9): IF(9=1, "AvgProb", **K10**) → K10 ← off by 1
- **Position 10** (Row 10): IF(10=1, "AvgProb", **K11**) → K11 ← **EMPTY (only 9 data rows)**

**Result**: All K–N data is shifted down by 1 row, and the last card (row 10) reads past the data range into empty cells.

### Fix
Change `Cards_Data!K2:K` → `Cards_Data!K:K` in all four formulas:

```
K1: =ARRAYFORMULA(IF(ROW(A:A)=1,"AvgProb",Cards_Data!K:K))
L1: =ARRAYFORMULA(IF(ROW(A:A)=1,"AvgEdge%",Cards_Data!L:L))
M1: =ARRAYFORMULA(IF(ROW(A:A)=1,"CardEV%",Cards_Data!M:M))
N1: =ARRAYFORMULA(IF(ROW(A:A)=1,"WinProbCash",Cards_Data!N:N))
```

Now alignment is correct:
- Position 1 (Row 1): IF(1=1,..., K1="AvgProb") → "AvgProb" ✓ (IF overrides)
- Position 2 (Row 2): IF(2=1,..., K2=data) → K2 ✓
- Position 10 (Row 10): IF(10=1,..., K10=data) → K10 ✓

---

## 4. Calculator Tab — Root Cause & Fix

### Root Cause
`sheets_push_legs.py` pushes with `valueInputOption="RAW"`, so numeric values (trueProb, edge) are stored as **text strings** in the Legs sheet. The Calculator's `INDEX/MATCH` returns these text strings. `AVERAGE()` and `FILTER()` on text strings produce `#DIV/0!`.

The Engine sheet already handles this with `*1` coercion (e.g., `C18*1 + C19*1`), but the Calculator does not.

### Fixed Formulas

#### Row 7 — Avg trueProb (B7)
```
=IF(COUNTA($B$2:$G$2)=0,"",AVERAGE(FILTER($B$3:$G$3*1, $B$2:$G$2<>"")))
```

#### Row 8 — Avg edge% (B8)
```
=IF(COUNTA($B$2:$G$2)=0,"",AVERAGE(FILTER($B$4:$G$4*1, $B$2:$G$2<>"")))
```

#### Slip Summary Block (Rows 11–19, Column C — AvgProb)
```
C11 (2P): =IFERROR(AVERAGE(FILTER(B$3:C$3*1,B$3:C$3<>"")),0)
C12 (3P): =IFERROR(AVERAGE(FILTER(B$3:D$3*1,B$3:D$3<>"")),0)
C13 (3F): =IFERROR(AVERAGE(FILTER(B$3:D$3*1,B$3:D$3<>"")),0)
C14 (4P): =IFERROR(AVERAGE(FILTER(B$3:E$3*1,B$3:E$3<>"")),0)
C15 (4F): =IFERROR(AVERAGE(FILTER(B$3:E$3*1,B$3:E$3<>"")),0)
C16 (5P): =IFERROR(AVERAGE(FILTER(B$3:F$3*1,B$3:F$3<>"")),0)
C17 (5F): =IFERROR(AVERAGE(FILTER(B$3:F$3*1,B$3:F$3<>"")),0)
C18 (6P): =IFERROR(AVERAGE(FILTER(B$3:G$3*1,B$3:G$3<>"")),0)
C19 (6F): =IFERROR(AVERAGE(FILTER(B$3:G$3*1,B$3:G$3<>"")),0)
```

#### Column D — LegMargin% (unchanged, works once C is fixed)
```
D11: =C11 - Engine!B46
D12: =C12 - Engine!C46
D13: =C13 - Engine!G46
D14: =C14 - Engine!D46
D15: =C15 - Engine!H46
D16: =C16 - Engine!E46
D17: =C17 - Engine!I46
D18: =C18 - Engine!F46
D19: =C19 - Engine!J46
```

#### Column E — EV (unchanged, driven by Engine binomial model)
```
E11: =Engine!B64    E12: =Engine!B75    E13: =Engine!B85
E14: =Engine!B96    E15: =Engine!B106   E16: =Engine!B117
E17: =Engine!B127   E18: =Engine!B138   E19: =Engine!B149
```

#### Column F — ROI% (unchanged)
```
F11: =Engine!B65    F12: =Engine!B76    F13: =Engine!B86
F14: =Engine!B97    F15: =Engine!B107   F16: =Engine!B118
F17: =Engine!B128   F18: =Engine!B139   F19: =Engine!B150
```

### How Calculator stays consistent across sites
The Calculator is fully driven by `Leg*_ID` in row 2. It uses `INDEX(Legs!$J$2:$J, MATCH(B2, Legs!$A$2:$A, 0))` to pull trueProb by ID. As long as:
- The ID exists in `Legs!A` (regardless of prefix `prizepicks-` or `underdog-`)
- The trueProb/edge values are in columns J/K of the Legs sheet

…the Calculator works identically for both sites. Swapping IDs in row 2 automatically recalculates all downstream values.

---

## 5. Root Cause Summary

**Underdog not producing cards**: The Underdog API endpoint likely changed its response shape, causing 0 raw props. Even if the API worked, the legs CSV uses a different column schema than PrizePicks (missing `id`, `gameTime`, `IsWithin24h`), making it incompatible with the Legs sheet and Calculator lookups.

**K10:N10 not populating**: The ARRAYFORMULA in K1–N1 references `Cards_Data!K2:K` instead of `Cards_Data!K:K`. Since the formula lives in row 1 but the data starts at K2, ARRAYFORMULA's element alignment creates a 1-row offset. The last card's data (row 10) maps to Cards_Data row 11 (empty). Fix: change to `Cards_Data!K:K`.
