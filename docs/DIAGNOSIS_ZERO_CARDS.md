# Phase C — Zero-cards root-cause diagnosis

**Scope:** Read-only diagnosis for run timestamp **2026-03-23T18:00:11 ET** (see `data/reports/latest_run_status.json`). No optimizer or threshold changes in this phase.

## PrizePicks (PP)

| # | Question | Answer |
|---|----------|--------|
| 1 | Input volume/quality degraded? | **Low volume:** 12 eligible legs after runner filters (`latest_pre_diversification_card_diagnosis.json`, `latest_run_status.json`). **Merge quality WARN:** overall merge coverage **29.35%**, PP match rate **~87.3%** (`merge_quality_status.json`, `latest_merge_quality.json` — `liveMergeQuality`). Odds snapshot **~108 min** older than merge wall clock (`latest_merge_quality.freshness`). Run flags **`live_input_degraded`**. |
| 2 | Merge / candidate formation degraded? | **PP match rate is relatively high** vs UD; **global** merge is still poor (many drops: line_diff, no_market). Not the *immediate* reason zero PP cards: builder still schedules **725** full leg sets and completes **725** EV evaluations. |
| 3 | Candidates failing thresholds? | **Yes — dominant PP failure.** Every structure reports **`evRejected` = successful card builds**, **`candidatesPreDedupe` = 0** for all flex types. `maxEffectiveLegEvObserved` **0.0353** at leg level does not yield any card passing card EV gate. `latest_card_ev_viability.json`: sampled **raw EV** ranges are **deeply negative** (e.g. 5F median ~**-0.29**), **`countPassingSportThreshold` = 0** per structure; best-case avg prob **~0.505–0.507** vs required breakeven avg prob **~0.54+**. |
| 4 | Thresholds passed then selection/gating removes? | **No.** `cardsAfterSelectionEngine` **0** with **0** entering selection (`selectionEngineBreakevenDropped` **0** for PP). |
| 5 | Output/assembly failing after viable candidates? | **No.** Assembly + EV evaluation run; **all** evaluated combos fail EV acceptance. |
| 6 | True no-edge slate? | **For the merged PP leg set and structures evaluated: yes.** Evidence: artifact **`rootCause`:** `pp_builder_zero_accepted_candidates`; **`dominantDropStage`:** `pp:buildCardsForSize_sampling_and_ev_gates`. |

**PP one-line verdict:** Zero cards because **no sampled card clears the card EV / structure economics gate** with the current legs; input is thin (12 legs) and live merge is degraded globally, but the **recorded choke is build-time EV rejection**, not post-selection.

## Underdog (UD)

| # | Question | Answer |
|---|----------|--------|
| 1 | Input volume/quality degraded? | **Yes, materially vs PP:** **`match_rate_ud` ~39.1%**, **597** unmatched legs, same **~108 min** odds-vs-merge skew and **`live_input_degraded`** (`latest_run_status.liveMergeInput`, `latest_merge_quality.json`). **16** eligible legs after runner filters — better count than PP but weaker merge stats. |
| 2 | Merge degraded? | **Yes** — UD match rate and overall **mergeCoverage ~0.29** support **material merge/scarcity stress** (plus staleness). |
| 3 | Candidates failing thresholds? | **Partially at leg/card construction:** **`combosPassedStructureThreshold` = 0** is **only incremented on the flex enumeration path** in `run_underdog_optimizer.ts`; **standard** structures (e.g. `UD_2P_STD`) can still emit cards without incrementing that counter. **8** cards exist **`cardsPreDedupe` / `cardsPostDedupe`**. |
| 4 | Thresholds passed then selection/gating removes? | **Yes — dominant UD failure for export.** **`selectionEngineBreakevenDropped` = 8** (all cards). `exampleBreakevenDropped`: **`avgProb` ~0.525** vs **`requiredBreakeven` ~0.577** for `UD_2P_STD`. **`cardsAfterSelectionEngine` = 0**. |
| 5 | Assembly failing after viable candidates? | **No** — 8 cards built; **final selection breakeven** removes them. |
| 6 | True no-edge slate? | **Not purely:** cards **do** clear construction into the selection funnel; they **fail breakeven vs implied probability** at selection. |

**UD one-line verdict:** Zero exported cards because **every surviving card is dropped at the selection-engine breakeven gate** (8/8), with merge/staleness **WARN** as **context** for weak implied probs.

## Primary blocker (by impact on zero-card outcome)

1. **PP:** **Card EV / viability gate at build** — no accepted candidates (`pp_builder_zero_accepted_candidates`); viability samples show **no** draws above sport card EV threshold and breakeven gaps **~3.6–3.7 pp** on best-case avg prob vs required.
2. **UD:** **Selection breakeven gate** — all **8** built cards fail `requiredBreakeven` vs **`avgProb`** (~**5.2 pp** short on the logged example).

**Cross-cutting:** **`live_input_degraded`** (stale odds vs merge, low merge coverage, low UD match rate) **amplifies** weak economics but does **not** replace the **site-specific proximate causes** above.

## Single highest-leverage next phase (one)

**Execute a fresh odds fetch + full re-merge run** (eliminate **~108 min** merge-vs-fetch skew, re-measure **`match_rate_ud`**, **`mergeCoverage`**, and re-check `latest_pre_diversification_card_diagnosis.json` / `latest_card_ev_viability.json`) **before** any EV/threshold/selection policy edits — evidence-driven, non-speculative, and addresses the **declared** `live_input_degraded` path for both platforms.

## Evidence index

- `artifacts/last_run.json` — degraded_success, `pp_legs` / metrics (note: may disagree with `latest_run_status` card counts; prefer reports for diagnosis).
- `data/reports/latest_run_status.json` — PP/UD picks/cards counts, `degradationReasons`, `liveMergeInput`, `optimizerEdgeQuality`.
- `data/reports/latest_pre_diversification_card_diagnosis.json` — funnel counts, `rootCause`, `dominantDropStage`, UD `selectionEngineBreakevenDropped`, `exampleBreakevenDropped`.
- `data/reports/latest_card_ev_viability.json` — PP structure EV histograms and breakeven gaps.
- `data/reports/latest_merge_quality.json`, `data/reports/merge_quality_status.json` — coverage, match rates, freshness.
- `data/reports/latest_optimizer_edge_quality.json` — `status=empty` (consequence of zero export, not a separate root cause).
- `src/run_underdog_optimizer.ts` — `combosPassedStructureThreshold` only updated in **flex** loop (explains 0 with 8 standard cards).
