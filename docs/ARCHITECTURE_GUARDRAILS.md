# Architecture guardrails

Stable boundaries and invariants. For commands and deploy, see **`docs/OPERATIONS_RUNBOOK.md`**.

## Do not cross without an explicit phase

- **`math_models/`** — do not change unless a task explicitly requires it.
- **EV / breakeven / edge formulas** — derive breakeven from `payoutByHits` and `solveBreakevenProbability`; never hardcode BE % or American odds for parlay math. Include all partial tiers in `payoutByHits` (`src/config/parlay_structures.ts`).
- **Optimizer ranking, gating, card construction** — treat as locked unless a dedicated change request says otherwise.
- **Secrets** — keep in root `.env` (gitignored); never commit credentials. See **`docs/OPERATIONS_RUNBOOK.md`** for env fail-fast behavior.

## Feature input vs math

- Context / non-EV feature work lives under **`src/feature_input/`**. Boundary vs **`math_models/`** and selection is documented in **`docs/FEATURE_INPUT_LAYER.md`**.
- **Fantasy score:** `fantasy_analyzer.ts` runs after card build as **diagnostic only** — not an EV input. `fantasy_score` props excluded from EV legs in `merge_odds.ts` by design. `fantasyAggregator.ts` is not wired into main EV flow.

## Pipeline / data

- **Paths SSOT:** `src/constants/paths.ts`, `scripts/_paths.ps1` — outputs under **`data/output_logs/`**, artifacts under **`artifacts/`**, archives **`data/legs_archive/`**, **`data/tier_archive/`**.
- **Providers:** Valid `--providers` are **PP** and **UD** only (no TRD).
- **Dry-test without live Odds API:** `USE_MOCK_ODDS=1` or `--mock-legs N` for PP mock path; see **`docs/PHASE_HISTORY.md`** § PIPELINE_STATUS for nuances when `--platform both`.

## Dashboard (read-only consumer)

- Dashboard loads synced JSON/CSV from **`web-dashboard/public/data/`** — no optimizer or math changes in UI-only work.
- **Decision / verdict:** `deriveOperatorDecision` + synced `latest_*` reports (see Phase 81–85 in **`docs/PHASE_HISTORY.md`**).

## Testing expectations (high level)

- **Canonical bundle:** `npm run verify:canonical` is the umbrella CI/local gate.
- **Breakeven invariants:** `npm run verify:breakeven` before ship (see workspace rules).
