# Google Sheets Formula Reference

Sheet ID: `193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo`

All data rows start at **row 2** (row 1 is headers).
Python push scripts clear + rewrite data columns from A2 down.
Formula columns (right of data) are **never cleared** by push scripts.

---

## 1. `Legs` Tab (PrizePicks)

**Source:** `sheets_push_legs.py` → `prizepicks-legs.csv`  
**Clear range:** `Legs!A2:O` (15 data columns)

| Col | Header        | Source            |
|-----|---------------|-------------------|
| A   | id            | CSV col 1         |
| B   | player        | CSV col 2         |
| C   | team          | CSV col 3         |
| D   | stat          | CSV col 4         |
| E   | line          | CSV col 5         |
| F   | league        | CSV col 6         |
| G   | book          | CSV col 7         |
| H   | overOdds      | CSV col 8         |
| I   | underOdds     | CSV col 9         |
| J   | trueProb      | CSV col 10        |
| K   | edge          | CSV col 11        |
| L   | legEv         | CSV col 12        |
| M   | runTimestamp   | CSV col 13        |
| N   | gameTime      | CSV col 14        |
| O   | IsWithin24h   | CSV col 15        |
| **P** | **Leg_Text** | **Formula below** |

### P1 — header
```
Leg_Text
```

### P2 — ARRAYFORMULA (paste once, auto-expands for all rows)
```
=ARRAYFORMULA(IF(A2:A="","",B2:B&" – "&D2:D&" "&E2:E))
```
Produces: `Cade Cunningham – rebounds 5`

> **Important:** Do NOT place any manual values in column P below P2.
> The ARRAYFORMULA auto-fills. Manual entries below it will cause `#REF!`.

---

## 2. `UD-Legs` Tab (Underdog)

**Source:** `sheets_push_underdog_legs.py` → `underdog-legs.csv`  
**Clear range:** `UD-Legs!A2:O` (15 data columns, same schema as Legs)

| Col | Header        | Source            |
|-----|---------------|-------------------|
| A   | id            | CSV col 1         |
| B   | player        | CSV col 2         |
| C   | team          | CSV col 3         |
| D   | stat          | CSV col 4         |
| E   | line          | CSV col 5         |
| F   | league        | CSV col 6         |
| G   | book          | CSV col 7         |
| H   | overOdds      | CSV col 8         |
| I   | underOdds     | CSV col 9         |
| J   | trueProb      | CSV col 10        |
| K   | edge          | CSV col 11        |
| L   | legEv         | CSV col 12        |
| M   | runTimestamp   | CSV col 13        |
| N   | gameTime      | CSV col 14        |
| O   | IsWithin24h   | CSV col 15        |
| **P** | **Leg_Text** | **Formula below** |

### P1 — header
```
Leg_Text
```

### P2 — ARRAYFORMULA (identical pattern to Legs tab)
```
=ARRAYFORMULA(IF(A2:A="","",B2:B&" – "&D2:D&" "&E2:E))
```

---

## 3. `Cards_Data` Tab (Unified PP + UD)

**Source:** `sheets_push_cards.py` → reads `prizepicks-cards.csv` + `underdog-cards.csv`  
**Clear range:** `Cards_Data!A2:N` (14 data columns)

### 3.1 Data Columns (pushed by Python — DO NOT put formulas here)

| Col | Header       | Source                          |
|-----|--------------|---------------------------------|
| A   | Date         | runTimestamp (unified ET format) |
| B   | Site         | `PP` or `UD`                    |
| C   | Slip         | flexType (2P, 5F, etc.)         |
| D   | Legs         | count of non-empty leg IDs      |
| E   | Leg1_ID      | leg1Id                          |
| F   | Leg2_ID      | leg2Id                          |
| G   | Leg3_ID      | leg3Id                          |
| H   | Leg4_ID      | leg4Id                          |
| I   | Leg5_ID      | leg5Id                          |
| J   | Leg6_ID      | leg6Id                          |
| K   | AvgProb      | avgProb                         |
| L   | AvgEdge%     | avgEdgePct                      |
| M   | CardEV%      | cardEv (decimal, e.g. 0.08)     |
| N   | WinProbCash  | winProbCash (from backend)      |

**Date format:** Both PP and UD now emit `YYYY-MM-DDTHH:MM:SS ET`
(e.g. `2026-02-09T20:41:03 ET`). No normalization needed in Sheets.

### 3.2 Formula Columns (paste formulas in row 1 headers + row 2)

| Col  | Header             | Type         |
|------|--------------------|--------------|
| O    | Leg1_Text          | ARRAYFORMULA |
| P    | Leg2_Text          | ARRAYFORMULA |
| Q    | Leg3_Text          | ARRAYFORMULA |
| R    | Leg4_Text          | ARRAYFORMULA |
| S    | Leg5_Text          | ARRAYFORMULA |
| T    | Leg6_Text          | ARRAYFORMULA |
| U    | PlayerBlock        | ARRAYFORMULA |
| V    | Strength           | ARRAYFORMULA |
| W    | CardWithin24h      | drag-down    |
| X    | KellyFraction      | ARRAYFORMULA |
| Y    | KellyStake         | ARRAYFORMULA |
| Z    | FinalStake         | ARRAYFORMULA |
| AA   | RiskAlreadyUsedToday | drag-down  |

### 3.3 Global Config Cells (right sidebar)

Place these labels + values in columns **AC–AD**, starting at row 1:

| Cell | Label              | Cell | Value / Formula                     |
|------|--------------------|------|-------------------------------------|
| AC1  | `Config`           | AD1  | *(blank)*                           |
| AC2  | `Bankroll`         | AD2  | `500` *(edit manually)*             |
| AC3  | `GlobalKelly%`     | AD3  | `0.25` *(edit manually, 0–1)*       |
| AC4  | `DailyRiskBudget`  | AD4  | `0.10` *(edit manually, 0–1)*       |
| AC5  | `TotalKellyRaw`    | AD5  | `=SUM(Y2:Y)`                        |
| AC6  | `DailyRiskFraction` | AD6 | `=IF(AD2=0,0,AD5/AD2)`             |
| AC7  | `ScalingFactor`    | AD7  | `=IF(AD6=0,1,MIN(1,AD4/AD6))`      |

- **Bankroll** — current bankroll in dollars.
- **GlobalKelly%** — fraction of full Kelly to apply (e.g. 0.25 = quarter Kelly).
- **DailyRiskBudget** — max fraction of bankroll to risk per day (e.g. 0.10 = 10%).
- **TotalKellyRaw** — sum of all KellyStake values.
- **DailyRiskFraction** — TotalKellyRaw / Bankroll.
- **ScalingFactor** — if DailyRiskFraction > DailyRiskBudget, scale down all stakes proportionally. Otherwise 1 (no scaling).

---

### 3.4 Leg1_Text – Leg6_Text (O–T)

These look up each leg ID in the correct Legs tab (PP → `Legs`, UD → `UD-Legs`)
to produce human-readable text like `LeBron James – points 25.5`.

**O1 header:** `Leg1_Text`

**O2 — ARRAYFORMULA (Leg1_Text):**
```
=ARRAYFORMULA(IF(E2:E="","",IFERROR(IF(B2:B="PP",VLOOKUP(E2:E,Legs!$A:$P,16,FALSE),VLOOKUP(E2:E,'UD-Legs'!$A:$P,16,FALSE)),"?")))
```

**P1:** `Leg2_Text`  
**P2:** *(same pattern, change `E2:E` → `F2:F`)*
```
=ARRAYFORMULA(IF(F2:F="","",IFERROR(IF(B2:B="PP",VLOOKUP(F2:F,Legs!$A:$P,16,FALSE),VLOOKUP(F2:F,'UD-Legs'!$A:$P,16,FALSE)),"?")))
```

**Q1:** `Leg3_Text` — **Q2:** change to `G2:G`  
**R1:** `Leg4_Text` — **R2:** change to `H2:H`  
**S1:** `Leg5_Text` — **S2:** change to `I2:I`  
**T1:** `Leg6_Text` — **T2:** change to `J2:J`

> Each formula is identical except for the leg-ID column reference (E→F→G→H→I→J).
> `"?"` fallback means the leg ID exists but wasn't found in either Legs tab — indicates stale data.

---

### 3.5 PlayerBlock (U)

Concatenates all non-empty Leg*_Text values with ` | ` separator.

**U1:** `PlayerBlock`

**U2 — ARRAYFORMULA:**
```
=ARRAYFORMULA(IF(B2:B="","",O2:O&IF(P2:P="","",(" | "&P2:P))&IF(Q2:Q="","",(" | "&Q2:Q))&IF(R2:R="","",(" | "&R2:R))&IF(S2:S="","",(" | "&S2:S))&IF(T2:T="","",(" | "&T2:T))))
```

Produces: `Cade Cunningham – rebounds 5 | Jayson Tatum – points 28.5 | …`

---

### 3.6 Strength (V)

Star rating based on CardEV%.

**V1:** `Strength`

**V2 — ARRAYFORMULA:**
```
=ARRAYFORMULA(IF(M2:M="","",IF(M2:M>=0.1,"★★★",IF(M2:M>=0.05,"★★","★"))))
```

---

### 3.7 CardWithin24h (W)

`TRUE` if **all** non-empty legs have `IsWithin24h = TRUE` in their respective
Legs tab. This is a drag-down formula (cross-sheet lookups per leg).

**W1:** `CardWithin24h`

**W2 — drag-down:**
```
=IF(B2="","",
  AND(
    IF(E2="",TRUE,IFERROR(IF(B2="PP",VLOOKUP(E2,Legs!$A:$O,15,FALSE)="TRUE",VLOOKUP(E2,'UD-Legs'!$A:$O,15,FALSE)="TRUE"),FALSE)),
    IF(F2="",TRUE,IFERROR(IF(B2="PP",VLOOKUP(F2,Legs!$A:$O,15,FALSE)="TRUE",VLOOKUP(F2,'UD-Legs'!$A:$O,15,FALSE)="TRUE"),FALSE)),
    IF(G2="",TRUE,IFERROR(IF(B2="PP",VLOOKUP(G2,Legs!$A:$O,15,FALSE)="TRUE",VLOOKUP(G2,'UD-Legs'!$A:$O,15,FALSE)="TRUE"),FALSE)),
    IF(H2="",TRUE,IFERROR(IF(B2="PP",VLOOKUP(H2,Legs!$A:$O,15,FALSE)="TRUE",VLOOKUP(H2,'UD-Legs'!$A:$O,15,FALSE)="TRUE"),FALSE)),
    IF(I2="",TRUE,IFERROR(IF(B2="PP",VLOOKUP(I2,Legs!$A:$O,15,FALSE)="TRUE",VLOOKUP(I2,'UD-Legs'!$A:$O,15,FALSE)="TRUE"),FALSE)),
    IF(J2="",TRUE,IFERROR(IF(B2="PP",VLOOKUP(J2,Legs!$A:$O,15,FALSE)="TRUE",VLOOKUP(J2,'UD-Legs'!$A:$O,15,FALSE)="TRUE"),FALSE))
  )
)
```

Copy down for all rows. Returns `TRUE`/`FALSE`.

---

### 3.8 KellyFraction (X)

Per-card Kelly fraction: `cardEv / ((1/winProbCash) − 1)`.
This is the simplified Kelly criterion: edge / net fair odds.

**X1:** `KellyFraction`

**X2 — ARRAYFORMULA:**
```
=ARRAYFORMULA(IF(M2:M="","",IF(OR(M2:M<=0,N2:N<=0,N2:N>=1),0,M2:M*N2:N/(1-N2:N))))
```

> Equivalent to `cardEv / ((1/winProbCash) − 1)` = `cardEv × winProbCash / (1 − winProbCash)`.
> Returns 0 for non-positive EV or invalid WinProbCash.

---

### 3.9 KellyStake (Y)

Dollar amount to wager: `Bankroll × GlobalKelly% × KellyFraction`.

**Y1:** `KellyStake`

**Y2 — ARRAYFORMULA:**
```
=ARRAYFORMULA(IF(X2:X="","",ROUND($AD$2*$AD$3*X2:X,2)))
```

---

### 3.10 FinalStake (Z)

KellyStake after applying the ScalingFactor (caps total daily risk).

**Z1:** `FinalStake`

**Z2 — ARRAYFORMULA:**
```
=ARRAYFORMULA(IF(Y2:Y="","",ROUND(Y2:Y*$AD$7,2)))
```

---

### 3.11 RiskAlreadyUsedToday (AA)

Running cumulative sum of FinalStake for rows where `CardWithin24h = TRUE`.
This is a drag-down formula (depends on rows above).

**AA1:** `RiskAlreadyUsedToday`

**AA2 — drag-down:**
```
=IF(B2="","",SUMPRODUCT(($W$2:W2=TRUE)*($Z$2:Z2)))
```

Copy down for all rows. Shows how much risk is committed as you go down the list.

---

### 3.12 WinProbCash Verification Formula (optional)

The backend now computes `WinProbCash` correctly and pushes it in column N.
If you want an in-Sheets verification column, use this IFS-based formula.

**Verification formula (e.g. in column AB, drag-down):**
```
=IF(K2="","",
  IFS(
    C2="2P", K2^2,
    C2="3P", K2^3,
    C2="4P", K2^4,
    C2="5P", K2^5,
    C2="6P", K2^6,
    C2="3F", BINOMDIST(3,3,K2,FALSE),
    C2="4F", BINOMDIST(4,4,K2,FALSE)+BINOMDIST(3,4,K2,FALSE),
    C2="5F", BINOMDIST(5,5,K2,FALSE)+BINOMDIST(4,5,K2,FALSE),
    C2="6F", BINOMDIST(6,6,K2,FALSE)+BINOMDIST(5,6,K2,FALSE),
    TRUE, N2
  )
)
```

> For Power slips: `P(all hit) = avgProb^n`.
> For Flex slips: sum of BINOMDIST for tiers where `multiplier > 1` (profit > 0).
> For UD slips (7F, 8F, etc.): falls through to `N2` (backend value).

---

## 4. `Calculator` Tab

The Calculator tab lets you paste leg IDs and see individual + composite EV.
It looks up trueProb from the correct Legs tab.

### Layout

| Col   | Row | Content                    |
|-------|-----|----------------------------|
| A1    | —   | `Date`                     |
| B1–G1 | —   | Leg1_ID … Leg6_ID          |
| A2    | —   | `(Player – Prop)` (label)  |
| B2–G2 | —   | Paste leg IDs here         |
| A3    | —   | `trueProb` (label)         |
| A4    | —   | `edge` (label)             |
| A5    | —   | `Name` (label)             |

### B3 (trueProb lookup for leg in B2) — copy across to G3
```
=IF(B2="","",
  IFERROR(
    IF(LEFT(B2,11)="prizepicks-",
      VLOOKUP(B2, Legs!A:J, 10, FALSE),
      VLOOKUP(B2, 'UD-Legs'!A:J, 10, FALSE)
    ),
    ""
  )
)
```

### B4 (edge lookup) — copy across to G4
```
=IF(B2="","",
  IFERROR(
    IF(LEFT(B2,11)="prizepicks-",
      VLOOKUP(B2, Legs!A:K, 11, FALSE),
      VLOOKUP(B2, 'UD-Legs'!A:K, 11, FALSE)
    ),
    ""
  )
)
```

### B5 (Leg_Text / Name lookup) — copy across to G5
```
=IF(B2="","",
  IFERROR(
    IF(LEFT(B2,11)="prizepicks-",
      VLOOKUP(B2, Legs!A:P, 16, FALSE),
      VLOOKUP(B2, 'UD-Legs'!A:P, 16, FALSE)
    ),
    ""
  )
)
```

### Composite stats (row 7–9 area)

**H7 — Avg trueProb:**
```
=IFERROR(AVERAGE(B3:G3), "")
```

**H8 — Avg edge%:**
```
=IFERROR(AVERAGE(B4:G4)*100, "")
```

**H9 — Count of active legs:**
```
=COUNTA(B2:G2)
```

### Slip EV rows (A11:F19 area)

The slip rows (2P, 3P, 3F, 4P, 4F, 5P, 5F, 6P, 6F) compute EV based on the
binomial model. These reference the Engine tab and are untouched by data pushes.

---

## 5. Important Notes

### Date format
Both PrizePicks and Underdog optimizers now emit timestamps in unified
Eastern-time ISO format: `YYYY-MM-DDTHH:MM:SS ET` (e.g. `2026-02-09T20:41:03 ET`).
No date normalization formulas are needed in Sheets.

### Leg_Text standardization
Both `Legs!P` and `UD-Legs!P` use the **same ARRAYFORMULA pattern**:
```
Player – stat line
```
Example: `LeBron James – points 25.5`

This ensures Cards_Data Leg*_Text and Calculator lookups work identically
for both PP and UD legs.

### Leg ID prefix convention
- PrizePicks: `prizepicks-{projId}-{stat}-{line}` (e.g. `prizepicks-9799968-rebounds-5`)
- Underdog: `underdog-{uuid}-{stat}-{line}` (e.g. `underdog-aeccef67-...-rebounds-4.5`)

Cards_Data formulas use `B2="PP"` (site column) to route lookups.
Calculator formulas use `LEFT(B2,11)="prizepicks-"` to auto-detect.

### Why IFERROR everywhere?
When a card references a leg ID that doesn't exist (e.g. stale ID from a
previous run), `VLOOKUP` returns `#N/A`. Wrapping in `IFERROR(..., "")` or
`IFERROR(..., "?")` prevents cascading errors.

### Push script safety
- `sheets_push_legs.py` clears `Legs!A2:O` — column P (Leg_Text) is safe.
- `sheets_push_underdog_legs.py` clears `UD-Legs!A2:O` — column P is safe.
- `sheets_push_cards.py` clears `Cards_Data!A2:N` — columns O+ (formulas) are safe.

### 7/8-pick Underdog limitation
The CSV schema currently supports 6 leg columns (Leg1_ID–Leg6_ID).
For 7- or 8-pick Underdog cards, legs 7–8 are omitted from the Sheets display.
The backend still evaluates all legs correctly for EV.

---

## 6. Setup Checklist

### Legs + UD-Legs (one-time setup)
1. **Legs tab, P1:** Type `Leg_Text`
2. **Legs tab, P2:** Paste the ARRAYFORMULA
3. **UD-Legs tab, P1:** Type `Leg_Text`
4. **UD-Legs tab, P2:** Paste the ARRAYFORMULA

### Cards_Data (one-time setup)
5. **O1–T1:** Type headers `Leg1_Text` through `Leg6_Text`
6. **O2–T2:** Paste the 6 Leg*_Text ARRAYFORMULAs (§3.4)
7. **U1:** `PlayerBlock` — **U2:** Paste ARRAYFORMULA (§3.5)
8. **V1:** `Strength` — **V2:** Paste ARRAYFORMULA (§3.6)
9. **W1:** `CardWithin24h` — **W2:** Paste drag-down formula (§3.7), copy down
10. **X1:** `KellyFraction` — **X2:** Paste ARRAYFORMULA (§3.8)
11. **Y1:** `KellyStake` — **Y2:** Paste ARRAYFORMULA (§3.9)
12. **Z1:** `FinalStake` — **Z2:** Paste ARRAYFORMULA (§3.10)
13. **AA1:** `RiskAlreadyUsedToday` — **AA2:** Paste drag-down formula (§3.11), copy down

### Global Config (one-time setup)
14. **AC1:** `Config`
15. **AC2:** `Bankroll` — **AD2:** `500` (your bankroll)
16. **AC3:** `GlobalKelly%` — **AD3:** `0.25`
17. **AC4:** `DailyRiskBudget` — **AD4:** `0.10`
18. **AC5:** `TotalKellyRaw` — **AD5:** `=SUM(Y2:Y)`
19. **AC6:** `DailyRiskFraction` — **AD6:** `=IF(AD2=0,0,AD5/AD2)`
20. **AC7:** `ScalingFactor` — **AD7:** `=IF(AD6=0,1,MIN(1,AD4/AD6))`

### Calculator (one-time setup)
21. **B3:** Paste trueProb lookup, copy to G3
22. **B4:** Paste edge lookup, copy to G4
23. **B5:** Paste Name lookup, copy to G5

### Verify
24. Run optimizers + push scripts to populate data
25. Verify Leg_Text fills for both PP and UD legs
26. Verify Leg1_Text–Leg6_Text fills for all Cards_Data rows
27. Verify WinProbCash is non-zero for PP rows
28. Verify KellyStake and FinalStake compute for all rows
29. Check no `#N/A` or `#REF!` errors remain
