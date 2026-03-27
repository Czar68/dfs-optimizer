# Phase D — Live input freshness / merge-quality confirmation

Purpose: prove or rule down stale/degraded live input as the dominant upstream blocker using one clean rerun and before/after diagnostics, without changing EV math, thresholds, ranking, gating, or card construction.

## Before vs after (key)

- Baseline run (prior): `data/reports/latest_run_status.json` at `2026-03-23T18:00:11 ET`
- Clean rerun (this phase): `data/reports/latest_run_status.json` at `2026-03-23T18:14:09 ET` via `scripts/run_optimizer.ps1 -Force`

### Freshness and merge quality

- Freshness improved materially:
  - `mergeVsFetchSkewMinutes`: **108.19 -> 0.31**
  - `oddsIsFromCache`: **true -> false**
  - `oddsSnapshotAgeMinutes`: **107.91 -> 0**
- Merge quality improved but still degraded:
  - `mergeCoverage`: **0.2935 -> 0.3224** (still below warn min 0.35)
  - `match_rate_pp`: **0.8734 -> 0.9765** (strong improvement)
  - `match_rate_ud`: **0.3908 -> 0.4281** (improved but still weak)
  - `liveInputDegraded`: remained **true** with `overallSeverity: WARN`

### Stage outcomes after clean rerun

- PP (`latest_pre_diversification_card_diagnosis.json`)
  - `eligibleLegsAfterRunnerFilters`: **12 -> 10**
  - `builderEvEvaluationsReturned`: **725 -> 725**
  - `cardsAfterSelectionEngine`: **0 -> 0**
  - `rootCause`: still `pp_builder_zero_accepted_candidates`
- UD (`latest_pre_diversification_card_diagnosis.json`)
  - Prior: `cardsPreDedupe=8`, `selectionEngineBreakevenDropped=8` (all dropped after build)
  - After rerun: `cardsPreDedupe=0`, `combosPassedConstructionGate=700`, `combosPassedStructureThreshold=0`, `selectionEngineBreakevenDropped=0`
  - Interpretation: failure moved earlier (structure threshold stage), still zero output

### PP viability check on refreshed inputs

- Regenerated `latest_card_ev_viability.json` after rerun (`npm run export:card-ev-viability`)
- `eligibleLegsLoaded`: **12 -> 10**
- 5F best-case:
  - `bestCaseAvgProb`: **0.5068 -> 0.5097** (small uptick)
  - `bestCaseAvgProbVsBreakevenGap`: **-0.0357 -> -0.0328**
  - `countPassingSportThreshold`: **0** (unchanged)
- Result: no material viability improvement; still all sampled EV bins below threshold

## Required question answers

1. Was prior zero-card run materially impaired by stale merge-vs-fetch timing or degraded input?  
   **Yes for freshness/merge observability** (huge skew fixed in rerun), but not sufficient to resolve zero-card outcomes.

2. After clean rerun, do PP and UD still fail in same stages?  
   **PP: yes (same stage, build-time EV rejection).**  
   **UD: no (moved earlier from post-build breakeven drop to structure-threshold non-passage before dedupe).**

3. Did PP candidate viability improve materially?  
   **No.** Small probability movement, still zero threshold pass.

4. Did UD built-card survival past breakeven improve materially?  
   **No.** There were no built cards in the rerun, so no breakeven survival to improve.

5. Is live input degradation dominant blocker or amplifier?  
   **Amplifier, not dominant.** Freshness was corrected and merge improved, but PP and UD still produced zero cards via economics/structure thresholds.

## Evidence pointers

- `data/reports/latest_run_status.json`
- `data/reports/latest_merge_quality.json`
- `data/reports/merge_quality_status.json`
- `data/reports/latest_pre_diversification_card_diagnosis.json`
- `data/reports/latest_card_ev_viability.json`
- `src/run_underdog_optimizer.ts` (counter semantics: `combosPassedStructureThreshold` incremented in flex loop path)
