// src/ev/juice_adjust.ts
// All math delegated to math_models/juice_adjust (locked-down canonical source)

export {
  trueBeFromOdds,
  fairBeFromTwoWayOdds,
  fairProbChosenSide,
  marketRelativeLegEdge,
  legacyNaiveLegMetric,
  structureBreakeven,
  juiceAwareLegEv,
} from '../../math_models/juice_adjust';
