# Phase 79 — Card EV / structure viability

Generated: **2026-03-23T22:15:28.334Z**

- **Legs file:** `C:\Dev\Projects\dfs-optimizer\prizepicks-legs.json`
- **Legs loaded:** 10 → **builder pool:** 10
- **Sport:** NBA | **evaluateFlexCard sport floor:** 0.800% (minCardEvFallback=0.008)

> Card raw EV uses `getStructureEV` → local i.i.d. binomial (`math_models/ev_dp_prizepicks.computeLocalEv`), same as `evaluateFlexCard`. Threshold from `getEvaluateFlexCardSportThreshold`.

## Summary

- **Global max raw EV (i.i.d. engine, sampled):** -17.327%
- **Closest structure (greedy best-case i.i.d. raw EV):** 3P (-17.327%)
- **Root cause (classification):** `expected_negative_ev_at_best_avg_prob_slate_too_tight`
- **Next action hint:** Leg pool average win rates are below what payouts require (see breakeven vs best-case avgProb). Wait for better lines or relax leg filters (product decision) — not an EV-engine bug.

## Example trace — best raw EV (sampled, gated)

- **Structure:** 3P
- **Leg IDs:** prizepicks-10797942-assists-4.5-over, prizepicks-10803839-assists-5.5-over, prizepicks-10797496-rebounds_assists-14.5-over
- **Leg true probs:** 0.5130, 0.5269, 0.5096
- **avgProb:** 0.516474 (rounded 0.5165)
- **Raw EV (i.i.d., production path):** -17.327%
- **Raw EV (DP exact, diagnostic):** -17.366%
- **Required breakeven avg leg prob (registry):** 55.03%
- **avgProb − p\*:** -3.385 pp
- **Sport EV floor:** 0.800% | **raw EV − floor:** -18.127 pp
- **Would pass evaluateFlexCard EV gate:** no

## Example trace — near-miss (highest raw EV below sport floor)

- **Structure:** 3P
- **Leg IDs:** prizepicks-10797942-assists-4.5-over, prizepicks-10803839-assists-5.5-over, prizepicks-10797496-rebounds_assists-14.5-over
- **Raw EV (i.i.d.):** -17.327% (floor 0.800%)

## By structure

### 5F (5 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 54.25% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 252 |
| After construction gate | 252 (skipped 0) |
| raw EV min / median / max | -34.340% / -27.334% / -19.774% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 50.97% |
| Greedy best-case raw EV (i.i.d.) | -19.774% |
| Greedy best-case raw EV (DP) | -19.808% |
| best avgProb − p* | -3.281 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 252 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 6F (6 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 54.21% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 210 |
| After construction gate | 210 (skipped 0) |
| raw EV min / median / max | -43.051% / -35.712% / -29.121% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 50.55% |
| Greedy best-case raw EV (i.i.d.) | -29.121% |
| Greedy best-case raw EV (DP) | -29.238% |
| best avgProb − p* | -3.658 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 210 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 5P (5 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 54.93% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 252 |
| After construction gate | 252 (skipped 0) |
| raw EV min / median / max | -48.345% / -40.262% / -31.198% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 50.97% |
| Greedy best-case raw EV (i.i.d.) | -31.198% |
| Greedy best-case raw EV (DP) | -31.265% |
| best avgProb − p* | -3.957 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 252 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 6P (6 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 54.66% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 210 |
| After construction gate | 210 (skipped 0) |
| raw EV min / median / max | -52.211% / -44.500% / -37.431% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 50.55% |
| Greedy best-case raw EV (i.i.d.) | -37.431% |
| Greedy best-case raw EV (DP) | -37.583% |
| best avgProb − p* | -4.111 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 210 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 4F (4 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 55.03% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 210 |
| After construction gate | 210 (skipped 0) |
| raw EV min / median / max | -33.437% / -27.051% / -18.665% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 51.37% |
| Greedy best-case raw EV (i.i.d.) | -18.665% |
| Greedy best-case raw EV (DP) | -18.662% |
| best avgProb − p* | -3.658 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 210 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 4P (4 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 56.23% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 210 |
| After construction gate | 210 (skipped 0) |
| raw EV min / median / max | -46.694% / -39.768% / -30.363% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 51.37% |
| Greedy best-case raw EV (i.i.d.) | -30.363% |
| Greedy best-case raw EV (DP) | -30.372% |
| best avgProb − p* | -4.860 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 210 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 3F (3 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 57.74% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 120 |
| After construction gate | 120 (skipped 0) |
| raw EV min / median / max | -30.880% / -26.493% / -19.968% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 51.65% |
| Greedy best-case raw EV (i.i.d.) | -19.968% |
| Greedy best-case raw EV (DP) | -19.985% |
| best avgProb − p* | -6.088 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 120 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 3P (3 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 55.03% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 120 |
| After construction gate | 120 (skipped 0) |
| raw EV min / median / max | -33.645% / -27.228% / -17.327% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 51.65% |
| Greedy best-case raw EV (i.i.d.) | -17.327% |
| Greedy best-case raw EV (DP) | -17.366% |
| best avgProb − p* | -3.385 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 120 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |

### 2P (2 legs)

| Metric | Value |
|---|---:|
| Registry breakeven p* (avg leg) | 57.74% |
| Sport card EV floor | 0.800% |
| Samples (combinations tried) | 45 |
| After construction gate | 45 (skipped 0) |
| raw EV min / median / max | -31.139% / -26.374% / -18.911% |
| Count ≥ sport floor | 0 |
| Greedy best-case avgProb | 51.99% |
| Greedy best-case raw EV (i.i.d.) | -18.911% |
| Greedy best-case raw EV (DP) | -18.918% |
| best avgProb − p* | -5.742 pp |

**Histogram (raw EV, gated samples)**

| Bin | Count |
|---|---:|
| ev < -0.10 | 45 |
| -0.10 <= ev < -0.05 | 0 |
| -0.05 <= ev < 0 | 0 |
| 0 <= ev < 0.004 | 0 |
| 0.004 <= ev < 0.008 | 0 |
| 0.008 <= ev < 0.012 | 0 |
| ev >= 0.012 | 0 |
