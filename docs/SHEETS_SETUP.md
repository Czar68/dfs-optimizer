# Google Sheets setup (NBA Props)

Spreadsheet: [NBA Props](https://docs.google.com/spreadsheets/d/193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo/edit?usp=sharing)

## 1. Get Editor access (fix "View only")

You need **Editor** access so the push scripts can write to the sheet.

1. Open the spreadsheet (link above).
2. Click **Share** (top right).
3. If you see "You have view-only access":
   - Ask the **owner** of the sheet to add your Google account with **Editor** permission, or
   - If you are the owner, check that you're signed in with the correct account (the one that owns the file).
4. Add your account (or the one used for `credentials.json` / OAuth) with role **Editor**.
5. Save. After that, the push scripts will be able to update the sheet.

## 2. Column layout (written by the pipeline)

The push scripts **write row 1 (headers)** and **row 2+ (data)** on each run. You do not need to manually insert columns or type headers — they are overwritten each push so columns always align.

### Legs tab

| A     | B   | C      | D     | E    | F    | G      | H    | I        | J         | K       | L       | M    | N           | O        | P            |
|-------|-----|--------|-------|------|------|--------|------|----------|-----------|---------|---------|------|-------------|----------|---------------|
| Sport | id  | player | team  | stat | line | league | book | overOdds | underOdds | trueProb | edge | legEv | runTimestamp | gameTime | IsWithin24h   |

Data starts at row 2.

### UD-Legs tab (Underdog)

Same as Legs, plus column **Q**: **IsNonStandardOdds**. (17 columns total.)

### Cards_Data tab

Column order is chosen so the **Calculator** tab can use **Date** in column A and **Slip** in column C:

| A    | B     | C    | D       | E     | F–M        | N      | O        | P       | Q          | R        | … |
|------|-------|------|---------|-------|------------|--------|----------|---------|------------|----------|---|
| Date | Sport | Slip | Card_ID | Legs  | Leg1_ID…Leg8_ID | AvgProb | AvgEdge% | CardEV% | WinProbCash | KellyStake | … |

- **A Date** – run timestamp (e.g. `2025-01-15T12:00:00.000Z`).
- **B Sport** – e.g. NBA, NCAAB.
- **C Slip** – slip type (e.g. 2P, 3F, 6F).
- **D Card_ID** – site: PP or UD.
- **E Legs** – number of legs (2–8).
- **F–M** – Leg1_ID … Leg8_ID (Leg7/Leg8 used for Underdog 7F/8F).
- Remaining columns: AvgProb, AvgEdge%, CardEV%, WinProbCash, KellyStake, PlayerBlock, selected, portfolioRank, efficiencyScore, Kelly fields, runTimestamp.

Data starts at row 2. Row 1 is written by `sheets_push_cards.py` on every run so headers always match the data.

## 3. Calculator tab

The **Calculator** tab (and any formulas that reference **Cards_Data**) should use:

- **Column A** = **Date** (when the run happened).
- **Column C** = **Slip** (slip type: 2P, 3P, 3F, …).

If you had previously set up formulas assuming "Date" in column 1 and "Slip type" in column 3, the pipeline now pushes data in that order. No extra columns are written without a header: the scripts write the header row first, then the data, so every column has a label.

**Tips for easier use:**

- Freeze row 1 (View → Freeze → 1 row) so headers stay visible.
- In Calculator, reference `Cards_Data!A:A` for Date and `Cards_Data!C:C` for Slip when building dropdowns or lookups.

## 4. Summary

| Issue | Action |
|-------|--------|
| View only | Share → Add your account as **Editor**. |
| Headers / alignment | Scripts write row 1 automatically; re-run the pipeline to refresh headers and data. |
| Date in column 1, Slip in column 3 | Cards_Data is pushed in that order (Date, Sport, Slip, Card_ID, …). |
| Extra columns without labels | Each push writes the full header row then data; no unlabeled columns. |
