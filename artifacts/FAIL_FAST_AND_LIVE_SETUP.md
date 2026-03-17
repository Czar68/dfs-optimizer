# Fail-Fast Validation & Live Data Setup

## 1. Fail-Fast Validation ✅

**Performed:** Run with intentionally invalid `ODDSAPI_KEY` to confirm the pipeline fails fast and records the failure.

- **Steps executed:**
  - Set `ODDSAPI_KEY=invalid-key-for-fail-fast` and `USE_MOCK_ODDS=0`.
  - Ran full pipeline via `scripts\run_optimizer.ps1 -Force`.
- **Result:**
  - Odds API returned **HTTP 401** (authentication error).
  - Snapshot had **0 rows**; pipeline logged **`[FATAL] No live odds—check ODDSAPI_KEY in .env and API quota`** and exited with **code 1**.
  - **artifacts/last_run.json** was written with:
    - `"status": "failed"`
    - `"error": "optimizer"`
  - No legs or cards CSVs were written under `data/output_logs/` (no processing of empty data).

**Script change:** When the node process exits non-zero (e.g. no live odds), the script now writes `artifacts/last_run.json` with failure so the artifact accurately reflects the error. Path-with-spaces handling was fixed (quoted script path; `--providers` set to `PP,UD` only).

---

## 2. Transition to Live Data — Production Checklist

Before a production run, ensure:

| Variable | Purpose | Production |
|----------|---------|------------|
| **ODDSAPI_KEY** (or **ODDS_API_KEY**) | The Odds API key for live player props | Set to your real key (e.g. in `.env` or shell). |
| **BANKROLL** | Used for Kelly stake sizing | Set by `run_optimizer.ps1` from `-bankroll` (default 700); override with `.\scripts\run_optimizer.ps1 -bankroll 600`. |
| **OUTPUT_DIR** | Directory for legs/cards CSVs; Python reads from here | Default `data/output_logs`; script sets cwd to repo root and Python uses `OUTPUT_DIR` env if set. |
| **USE_MOCK_ODDS** | Bypass live API and use synthetic legs | **Set to `0` or leave unset** for production. Use `1` or `--mock-legs N` only for dry-test. |

**Commands:**

- Production (live data):
  - Ensure `.env` has valid `ODDSAPI_KEY` (and no `USE_MOCK_ODDS=1`).
  - Run: `.\scripts\run_optimizer.ps1 -Force` (optionally `-bankroll 600`).
- Dry-run (no API): `USE_MOCK_ODDS=1` or `.\scripts\run_optimizer.ps1 -Force` with `--mock-legs 50` (via env or CLI as supported).

---

## 3. Schema Reconciliation: UnifiedProp / MergedProp vs 23-Column Cards Tab

The **Cards tab** uses a **23-column schema (A–W)** consumed by `sheets_push_cards.py`:

- **A** RunTime, **B** GameTime, **C** Site, **D** Slip, **E** Player, **F** Stat+Line, **G** Pick, **H** KellyStake$, **I** Tier, **J** AvgEdge%, **K** CardEV, **L** LegID, **M** ParlayGroup, **N** AvgProb%, **O** trueProb%, **P** underOdds, **Q** overOdds, **R** EV, **S** 1.5Kelly, **T** DeepLink, **U** LastRun, **V** Notes, **W** CardKelly$.

**Current pipeline:** Uses `MergedPick` → `EvPick` → card building → `writeLegsCsv` / `writeCardsCsv`. The **cards CSV** is card-level (site, flexType, cardEv, leg1Id…leg6Id, kellyStake, runTimestamp, …). The **legs CSV** is leg-level (id, player, stat, line, trueProb, edge, legEv, overOdds, underOdds, gameTime, …). Python builds **one row per leg** (23 columns) by joining cards CSV + legs lookup.

**MergedProp** (from `src/types/unified-prop.ts`) is **leg-level**: id, provider, player, statType, lineValue, breakeven, odds (over/under), edge, trueProb, raw.

### Mapping: MergedProp → 23-column (per-leg row)

| 23-col | Source from MergedProp |
|--------|-------------------------|
| L LegID | `id` |
| C Site | `provider` (PP/UD) |
| E Player | `player` |
| F Stat+Line | `statType` + `lineValue` |
| O trueProb% | `trueProb` |
| P underOdds, Q overOdds | `odds.under`, `odds.over` |
| R EV | `edge` (or legEv if we expose it) |

### Fields missing from MergedProp for the full 23-column row

1. **GameTime (B)** — Not on MergedProp. Today this comes from `EvPick.startTime` in the legs CSV. For a MergedProp-based flow, add **gameTime** (or startTime/commenceTime) either on MergedProp or in `raw` from the event/odds source.
2. **RunTime (A)** — Run timestamp; not leg-level. Supply at write time when producing the CSV/rows.
3. **Slip (D), Tier (I), AvgEdge% (J), CardEV (K), ParlayGroup (M), AvgProb% (N), CardKelly$ (W)** — **Card-level**. MergedProp does not have them; they come from a **card-building step** (group legs into parlays, compute card EV, avg prob, avg edge, tier, parlay group id, card Kelly). So any pipeline that starts from MergedProp must either:
   - Build cards from MergedProp[] (or from a merged leg list that includes MergedProp-like fields), then output card-level + leg-level CSVs in the same shape as today, or
   - Emit an intermediate format that the existing Python (or frontend) can expand using the same card-level + leg-level join.
4. **Pick (G), KellyStake$ (H), 1.5Kelly (S)** — Derived: Pick from edge/odds convention; Kelly from edge + odds + bankroll. Can be computed from MergedProp (edge, odds) and bankroll.
5. **DeepLink (T)** — Built from LegID (e.g. UD `?legs=L2`, PP `/entry/L2`); LegID is on MergedProp.
6. **LastRun (U), Notes (V)** — Optional metadata; not on MergedProp.

**Summary:** MergedProp has everything needed for **leg-level** columns (LegID, Site, Player, Stat+Line, trueProb, odds, EV). The only **leg-level** field currently missing for the 23-col consumer is **GameTime** (and optionally RunTime at write time). All **card-level** columns (Slip, Tier, AvgEdge%, CardEV, ParlayGroup, AvgProb%, CardKelly$) require a card-building step from MergedProp[] (or equivalent) before producing the 23-column output; the current `EvPick` → card builder → writeCardsCsv/writeLegsCsv flow already does that. To integrate UnifiedProp/MergedProp into the same 23-col output, add **gameTime** (or startTime) to MergedProp or `raw`, and feed MergedProp[] into a card builder that produces the same card/leg CSV schema the Python and frontend expect.
