import type { CardEvResult } from "../src/types";
import {
  buildOptimizerEdgeQualityAudit,
  DEFAULT_HIGH_EV_BAR_FOR_EDGE_AUDIT,
  formatOptimizerEdgeQualityMarkdown,
  OPTIMIZER_EDGE_QUALITY_AUDIT_SCHEMA_VERSION,
} from "../src/reporting/optimizer_edge_quality_audit";
import { parseOptimizerEdgeQualityDashboardJson } from "../web-dashboard/src/lib/optimizerEdgeQualityAudit";

function minimalCard(overrides: Partial<CardEvResult> & { site?: string }): CardEvResult {
  const pick = {
    id: "leg1",
    player: "A",
    stat: "pts",
    line: 20,
    sport: "NBA" as const,
    site: (overrides as { site?: string }).site === "underdog" ? ("underdog" as const) : ("prizepicks" as const),
  } as unknown as CardEvResult["legs"][0]["pick"];
  return {
    flexType: "5F",
    legs: [{ pick, side: "over" as const }],
    stake: 1,
    totalReturn: 2,
    expectedValue: 0.1,
    winProbability: 0.5,
    cardEv: 0.1,
    winProbCash: 0.4,
    winProbAny: 0.5,
    avgProb: 0.55,
    avgEdgePct: 5,
    hitDistribution: {} as CardEvResult["hitDistribution"],
    site: (overrides as { site?: string }).site === "underdog" ? "underdog" : "prizepicks",
    ...overrides,
  } as CardEvResult;
}

describe("Phase 117 optimizer edge quality audit", () => {
  it("buildOptimizerEdgeQualityAudit: empty export yields empty status + degraded", () => {
    const a = buildOptimizerEdgeQualityAudit({
      generatedAtUtc: "2026-03-22T12:00:00.000Z",
      ppExportCards: [],
      udExportCards: [],
      ppCandidatePoolCount: null,
      udCandidatePoolCount: null,
      cardEvFloor: 0.008,
      highEvBar: DEFAULT_HIGH_EV_BAR_FOR_EDGE_AUDIT,
      rootDir: process.cwd(),
    });
    expect(a.schemaVersion).toBe(OPTIMIZER_EDGE_QUALITY_AUDIT_SCHEMA_VERSION);
    expect(a.outputQuality.status).toBe("empty");
    expect(a.outputQuality.degradedOutput).toBe(true);
    expect(a.pp).toBeNull();
    expect(a.ud).toBeNull();
  });

  it("buildOptimizerEdgeQualityAudit: PP slice + concentration flags when top-heavy and shallow vs pool", () => {
    const high = minimalCard({ cardEv: 0.3 });
    const mid = minimalCard({ cardEv: 0.04, legs: high.legs });
    const low = minimalCard({ cardEv: 0.04, legs: high.legs });
    const a = buildOptimizerEdgeQualityAudit({
      generatedAtUtc: "2026-03-22T12:00:00.000Z",
      ppExportCards: [high, mid, low],
      udExportCards: [],
      ppCandidatePoolCount: 120,
      udCandidatePoolCount: null,
      cardEvFloor: 0.008,
      highEvBar: 0.07,
      rootDir: process.cwd(),
    });
    expect(a.pp?.exportedCardCount).toBe(3);
    expect(a.explainability.fragilityFlags).toContain("high_top_ev_concentration");
    expect(a.explainability.fragilityFlags).toContain("very_shallow_export_vs_pool");
    expect(formatOptimizerEdgeQualityMarkdown(a)).toContain("Optimizer edge quality audit");
  });

  it("parseOptimizerEdgeQualityDashboardJson accepts audit-shaped JSON", () => {
    const raw = {
      outputQuality: { status: "moderate", degradedOutput: false, summaryLine: "optimizer_edge_quality: x" },
      explainability: { lines: ["PP: 1 exported"], fragilityFlags: ["few_exported_cards"] },
    };
    const p = parseOptimizerEdgeQualityDashboardJson(raw);
    expect(p?.outputQuality?.status).toBe("moderate");
    expect(p?.explainability?.fragilityFlags).toEqual(["few_exported_cards"]);
  });
});
