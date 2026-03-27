# Gating metric correction (Phase 73)

Generated: 2026-03-24T20:43:13.257Z

## Metric definitions
- **marketEdgeFairCanonical:** juiceAwareLegEv in math_models/juice_adjust.ts — trueProb − fairProbChosenSide (two-way de-vig via fairBeFromTwoWayOdds) when both American prices exist; otherwise trueProb − 0.5.
- **legacyNaiveLegMetric:** EvPick.legacyNaiveLegMetric = effectiveTrueProb − 0.5 in calculate_ev (diagnostic; same probability basis as gating edge before haircut vs after is isolated to effectiveTrueProb).
- **phase72TableSemantics:** Survival counts reuse Phase 72 CSV simulation: ‘current’ used CSV edge/legEv from prior exports (naive era); ‘marketFair’ applies the same numeric thresholds to recomputed trueProb − fair chosen. After a fresh optimizer run, exported edge/legEv should align with marketFair.

## Code paths changed
- math_models/juice_adjust.ts — fairProbChosenSide, marketRelativeLegEdge, legacyNaiveLegMetric, juiceAwareLegEv
- math_models/nonstandard_canonical_leg_math.ts — outcome on CanonicalLegMathInput; computeCanonicalLegMarketEdge
- src/nonstandard_canonical_mapping.ts — outcome on canonicalLeg
- src/calculate_ev.ts — edge/legEv + legacyNaiveLegMetric + fairProbChosenSide
- src/types.ts — optional legacyNaiveLegMetric, fairProbChosenSide
- src/ev/juice_adjust.ts — re-exports
- src/ev/leg_ev_pipeline.ts — outcome passed to juiceAwareLegEv
- src/run_optimizer.ts / src/run_underdog_optimizer.ts — legs CSV columns
- src/reporting/market_edge_alignment_analysis.ts — fairProbChosenSide / naive from math_models
- src/reporting/export_market_edge_alignment_diagnosis.ts — definition text
- src/reporting/export_pipeline_trace_diagnosis.ts — side-aware canonical trace

## Before / after (Phase 72 methodology on latest legs CSV)
```json
{
  "pp": {
    "stages": null
  },
  "ud": {
    "gates": {
      "current": {
        "afterEdgeAndStdLegEv": 1
      },
      "marketFair": {
        "afterEdgeAndStdLegEv": 1
      }
    }
  }
}
```

## Post-correction assessment
```json
{
  "ppSurvivorsAtMarketFairGate": null,
  "ppMinEligibleLegsForCardBuild": 6,
  "ppLikelyNonViableAfterCorrection": null,
  "udSurvivorsBeforeNaiveCsv": 1,
  "udSurvivorsAtMarketFairGate": 1,
  "udCompressesTowardRealisticSurvival": false
}
```

## Threshold follow-up
Phase 73 does not retune floors. If PP remains at zero effective survivors at market-relative gates after fresh exports, next phase should choose between threshold retuning versus PP-specific source/pool work.
