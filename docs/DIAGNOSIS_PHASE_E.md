# Phase E — PP candidate viability diagnosis

**Scope:** Read-only. No EV math, thresholds, ranking, gating, or card-construction changes.

**Data run:** `latest_pre_diversification_card_diagnosis.json` generated `2026-03-23T22:14:32.327Z` (aligned with post–Phase D clean run). `latest_card_ev_viability.json` regenerated `2026-03-23T22:15:28.334Z` on current `prizepicks-legs.json`.

## 1. Exact stage where PP viable cards die

**Inside `evaluateFlexCard` in `src/card_ev.ts`**, before any post-EV acceptance in `buildCardsForSize` (no candidates ever reach dedupe).

Pipeline order in `buildCardsForSize` (`src/run_optimizer.ts`):

1. Pool from `buildPpCardBuilderPool(legs)` — **10** legs after true-prob filter (`poolLegsAfterTrueProbFilter` per structure).
2. Sampling loop: assemble **size** distinct players, pass construction gate → **`successfulCardBuilds`** increments.
3. Optional feasibility upper-bound prune — **`feasibilityPruned`: 0** for this run.
4. **`evaluateFlexCard(...)`** — **`evCallsMade`** equals successful builds; **`evRejected`** counts calls where `evaluateFlexCard` returns **`null`**.
5. Only if `evaluateFlexCard` returns non-null does code check `result.cardEv < getMinEvForFlexType` and push to **`candidates`**.

**Observed:** For every structure row, **`evRejected` === `evCallsMade`** and **`evRejected` === `successfulCardBuilds`**, and **`candidatesPreDedupe` = 0**. So **every** EV call returns **`null`** at step 4.

**Code proof (`src/card_ev.ts`):** `evaluateFlexCard` returns `null` when `getStructureEV` is falsy **or** when `structureEV.ev < sportThreshold` (`getEvaluateFlexCardSportThreshold` with `minCardEvFallback`, default **0.008** on this run — see `latest_card_ev_viability.json`).

## 2. Failure mode (structure / sampling / EV / acceptance)

| Stage | Failing? | Evidence |
|-------|----------|----------|
| Before candidate formation (too few legs for structure) | **No** | `earlyExitTooFewLegs: false`, `minLegsRequiredForCardBuild: 6`, pool has **10** legs, **725** scheduled attempts, **725** successful full leg sets. |
| Sampling / construction | **No** | `failedCardBuilds: 0` totals; legs assemble for each attempt. |
| **EV check (`evaluateFlexCard`)** | **Yes — exclusive** | `evRejected` = all EV calls; `feasibilityPruned: 0`. |
| Post-EV min flex-type filter (`result.cardEv < getMinEvForFlexType`) | **N/A** | No non-null `rawResult`, so this branch never accepts. |
| Dedupe / export | **N/A** | `candidatesPreDedupe: 0`; nothing to dedupe. |

Artifact labels: **`dominantDropStage`:** `pp:buildCardsForSize_sampling_and_ev_gates`; **`rootCause`:** `pp_builder_zero_accepted_candidates`.

## 3. Dominant limiting factor (one)

**EV viability vs sport card-EV floor:** merged leg implied probabilities are too low (and/or structure EV from pooled avg prob too negative) for **any** sampled card to clear **`sportCardEvThreshold` (0.008)** inside `evaluateFlexCard`.

Supporting viability export (`latest_card_ev_viability.json`):

- **`countPassingSportThreshold`: 0** for structures shown (e.g. 5F).
- **All** sampled raw EV mass in the lowest histogram bucket (`ev < -0.10`).
- **Best-case** sample: `bestCaseAvgProb` ~**0.5097** vs `requiredBreakevenAvgLegProb` ~**0.5425**, `bestCaseAvgProbVsBreakevenGap` **negative** (~**-0.033**).

**Thin leg pool (10 eligible legs)** is a **strong contributing constraint** (limited combinatorial diversity), but the **recorded choke** is **EV gate failure on every attempt**, not an empty pool or pre-EV prune.

## 4. Evidence summary (dominant PP blocker)

1. **`data/reports/latest_pre_diversification_card_diagnosis.json`** — per-structure **`evRejected` = `evCallsMade`**, **`candidatesPreDedupe` = 0**, **`feasibilityPruned` = 0**.
2. **`data/reports/latest_card_ev_viability.json`** — **`countPassingSportThreshold` = 0**; histogram shows no draws above threshold; breakeven gap negative on best-case.
3. **`src/card_ev.ts`** — explicit early return when `structureEV.ev < sportThreshold`.
4. **`src/run_optimizer.ts`** — `evRejected++` only when `evaluateFlexCard` returns falsy (`!rawResult`).

## 5. Single highest-leverage next phase (one)

**Phase F — PP leg pool & merge-output audit (operational / data-path):** quantify whether the merged PP leg universe can ever produce avg leg true probabilities consistent with positive structure EV at current rules, by tracing **source legs → `trueProb` / `edge` distribution → `buildPpCardBuilderPool` ranking** — **without** changing thresholds or EV formulas. This targets the **dominant choke** (structure EV vs floor) at its inputs rather than retuning gates.
