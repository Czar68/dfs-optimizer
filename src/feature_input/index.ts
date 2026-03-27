/** Phase 87 — public surface for non-math context feature inputs (see `docs/FEATURE_INPUT_LAYER.md`). */
export type {
  ContextFeatureFamily,
  ContextFeatureRecord,
  FeatureValueKind,
} from './context_feature_contract'
export { FEATURE_INPUT_MODULE_PREFIX } from './context_feature_contract'
export { normalizeContextFeatureValue } from './normalize_context_feature_value'
export type { NormalizeContextFeatureOptions } from './normalize_context_feature_value'
export { buildRollingFormBinaryFeatures } from './rolling_form_features'
export type { RollingFormBinaryInput } from './rolling_form_features'
export { buildRollingFormContextRecordsFromHistoricalRow } from './rolling_form_context_features'
export { buildMarketContextRecordsFromHistoricalRow } from './market_context_features'
export { buildMatchupContextRecordsFromHistoricalRow } from './matchup_context_features'
export { buildRoleStabilityRecordsFromHistoricalRow } from './role_stability_features'
export { buildMinutesAvailabilityRecordsFromHistoricalRow } from './minutes_availability_grounded_bridge'
export { buildGameEnvironmentRecordsFromHistoricalRow } from './game_environment_grounded_bridge'
export { buildMinutesAvailabilityFeatures } from './minutes_availability_features'
export type { GameLogMinuteRow, MinutesAvailabilityInput } from './minutes_availability_features'
export { buildGameEnvironmentFeatures } from './game_environment_features'
export type { GameEnvironmentInput } from './game_environment_features'
export { buildTeamDefenseFeatures } from './team_defense_features'
export type { TeamDefenseInput } from './team_defense_features'
export {
  buildScheduleHomeAwayContextRecords,
} from './schedule_home_away_context_features'
export type {
  ScheduleHomeAwayContextInput,
  ScheduleHomeAwayFields,
} from './schedule_home_away_context_features'
export { joinContextFeaturesForSubject } from './feature_join'
export type { ContextFeatureValueMap, JoinedContextFeatures } from './feature_join'
export { buildFeatureSnapshot } from './feature_snapshot'
export type { FeatureSnapshot } from './feature_snapshot'
export { scoreFeatureSnapshot } from './feature_scoring'
export type { FeatureScoreSignals } from './feature_scoring'
export { attachFeatureContextToCard, attachFeatureContextToPick } from './attach_context_features'
export { summarizeFeatureSignals } from './feature_diagnostics'
export type { FeatureSignalsSummary, SignalAxisStats } from './feature_diagnostics'
export { evaluateSignalPerformance, signalValueBucket } from './feature_outcome_validation'
export type {
  BucketPerformance,
  SignalAxisPerformance,
  SignalBucketLabel,
  SignalPerformanceReport,
} from './feature_outcome_validation'
