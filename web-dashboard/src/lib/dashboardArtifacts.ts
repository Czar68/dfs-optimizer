/** Browser-safe types for `data/reports` JSON consumed by the dashboard (Phase 81). */

export interface RunStatusArtifact {
  generatedAtUtc?: string
  runTimestamp?: string | null
  success?: boolean
  outcome?: string
  runHealth?: 'success' | 'degraded_success' | 'partial_completion' | 'hard_failure' | string
  earlyExitReason?: string | null
  fatalReason?: string | null
  degradationReasons?: string[]
  missingExpectedArtifacts?: string[]
  prizepicks?: { picksCount?: number | null; cardsCount?: number | null }
  underdog?: { picksCount?: number | null; cardsCount?: number | null }
  /** Phase 115 — optional echo when run status written after merge quality. */
  liveMergeInput?: {
    qualitySeverity?: string
    liveInputDegraded?: boolean
    liveMergeQualityLine?: string
    mergeQualityStatusRel?: string
  }
  /** Phase 117 — optional; echoed from audit write at run end. */
  optimizerEdgeQuality?: {
    status?: string
    degradedOutput?: boolean
    summaryLine?: string
    artifactRel?: string
  }
}

export interface PreDiversificationDiagnosisArtifact {
  schemaVersion?: number
  generatedAtUtc?: string
  dominantDropStage?: string
  rootCause?: string
  pp?: {
    eligibleLegsAfterRunnerFilters?: number
    minLegsRequiredForCardBuild?: number
    earlyExitTooFewLegs?: boolean
    cardsAfterBuilderPostStructureDedupe?: number
    structureBuildStats?: Array<{ flexType?: string; evRejected?: number; successfulCardBuilds?: number }>
  }
  ud?: {
    eligibleLegsAfterRunnerFilters?: number
    cardsPostDedupe?: number
    cardsAfterSelectionEngine?: number
    selectionEngineBreakevenDropped?: number
    exampleBreakevenDropped?: { format?: string; avgProb?: number; requiredBreakeven?: number } | null
  }
}

/** Per-structure rows from `latest_card_ev_viability.json` (Phase 79 export; read-only display). */
export interface CardEvViabilityStructureRow {
  flexType?: string
  size?: number
  sportCardEvThreshold?: number
  bestCaseRawEvIid?: number
}

export interface CardEvViabilityArtifact {
  schemaVersion?: number
  generatedAtUtc?: string
  sport?: string
  minCardEvFallback?: number
  sportCardEvThreshold?: number
  globalRawEvMax?: number
  rootCauseClassification?: string
  nextActionHint?: string
  noteProductionPath?: string
  structures?: CardEvViabilityStructureRow[]
}

export interface HistoricalFeatureRegistryArtifact {
  schemaVersion?: number
  generatedAtUtc?: string
  sourcePath?: string
  rowCount?: number
  marketGroups?: number
  coverage?: Array<{ field?: string; nonNullCount?: number; fraction?: number }>
}

export async function fetchDashboardJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}
