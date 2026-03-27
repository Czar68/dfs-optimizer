/** Browser-safe parse for optional `latest_optimizer_edge_quality.json` (Phase 117). */

export interface OptimizerEdgeQualityDashboardSlice {
  outputQuality?: {
    status?: string
    degradedOutput?: boolean
    summaryLine?: string
  }
  explainability?: {
    lines?: string[]
    fragilityFlags?: string[]
  }
}

export function parseOptimizerEdgeQualityDashboardJson(raw: unknown): OptimizerEdgeQualityDashboardSlice | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const outputQuality =
    o.outputQuality && typeof o.outputQuality === "object" ? (o.outputQuality as Record<string, unknown>) : undefined;
  const explainability =
    o.explainability && typeof o.explainability === "object"
      ? (o.explainability as Record<string, unknown>)
      : undefined;
  return {
    outputQuality: outputQuality
      ? {
          status: typeof outputQuality.status === "string" ? outputQuality.status : undefined,
          degradedOutput:
            typeof outputQuality.degradedOutput === "boolean" ? outputQuality.degradedOutput : undefined,
          summaryLine: typeof outputQuality.summaryLine === "string" ? outputQuality.summaryLine : undefined,
        }
      : undefined,
    explainability: explainability
      ? {
          lines: Array.isArray(explainability.lines)
            ? explainability.lines.filter((x): x is string => typeof x === "string")
            : undefined,
          fragilityFlags: Array.isArray(explainability.fragilityFlags)
            ? explainability.fragilityFlags.filter((x): x is string => typeof x === "string")
            : undefined,
        }
      : undefined,
  };
}
