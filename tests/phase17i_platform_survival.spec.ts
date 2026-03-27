import fs from "fs";
import os from "os";
import path from "path";
import type { CardEvResult } from "../src/types";
import {
  buildPpSurvivalSnapshot,
  buildPlatformSurvivalSummary,
  countPpCardsByFlexType,
  formatPlatformSurvivalMarkdown,
  writePhase17iOperatorArtifacts,
  getPlatformSurvivalReportPaths,
} from "../src/reporting/platform_survival_summary";

function minimalCard(flexType: string, cardEv: number): CardEvResult {
  const pick = {
    id: `leg-${flexType}`,
    player: "A",
    stat: "pts",
    line: 20,
    sport: "NBA" as const,
    site: "prizepicks" as const,
  } as unknown as CardEvResult["legs"][0]["pick"];
  return {
    flexType: flexType as CardEvResult["flexType"],
    legs: [{ pick, side: "over" as const }],
    stake: 1,
    totalReturn: 2,
    expectedValue: cardEv,
    winProbability: 0.5,
    cardEv,
    winProbCash: 0.4,
    winProbAny: 0.5,
    avgProb: 0.55,
    avgEdgePct: 5,
    hitDistribution: {} as CardEvResult["hitDistribution"],
    site: "prizepicks",
  } as CardEvResult;
}

describe("Phase 17I platform survival summary", () => {
  it("countPpCardsByFlexType aggregates by flexType", () => {
    const cards = [minimalCard("5F", 0.1), minimalCard("5F", 0.09), minimalCard("6F", 0.08)];
    expect(countPpCardsByFlexType(cards)).toEqual({ "5F": 2, "6F": 1 });
  });

  it("buildPlatformSurvivalSummary is deterministic for fixed inputs", () => {
    const pp = buildPpSurvivalSnapshot({
      rawScrapedProps: 100,
      mergeMatchedProps: 80,
      afterEvCompute: 70,
      afterMinEdge: 60,
      afterMinLegEvBeforeAdjEv: 50,
      afterAdjEvThreshold: 40,
      afterPlayerCap: 35,
      cardsBuiltPreTypeEvFilter: 20,
      cardsAfterPerTypeMinEv: 18,
      cardsAfterSelectionEngine: 15,
      cardsExported: 10,
      exportedByFlexType: { "5F": 6, "6F": 4 },
      thresholds: {
        minEdgePerLeg: 0.015,
        minLegEv: 0.02,
        evAdjThresh: 0.0225,
        maxLegsPerPlayer: 1,
        volumeMode: false,
      },
    });
    const a = buildPlatformSurvivalSummary({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: "2026-03-20T08:00:00 ET",
      runMode: "both",
      pp,
      ud: {
        rawScrapedProps: 200,
        mergedProps: 150,
        evComputed: 120,
        afterFilterEvPicks: 100,
        afterSiteFilter: 90,
        finalLegPoolForCards: 90,
        generatedTotal: 500,
        generatedByStructureId: { UD_8F_FLX: 400, UD_3P_STD: 100 },
        generatedByFlexTypePreCap: { "8F": 400, "3P": 100 },
        exportedTotal: 400,
        exportedByStructureId: { UD_8F_FLX: 350, UD_3P_STD: 50 },
        exportedByFlexType: { "8F": 350, "3P": 50 },
        maxCardsCap: 800,
        autoBoostSecondPass: false,
        usedSharedLegs: false,
        udMinLegEv: 0.012,
        udMinEdge: 0.006,
        udVolume: false,
        allowedStandardStructureIds: ["UD_2P_STD"],
        allowedFlexStructureIds: ["UD_8F_FLX"],
        notes: ["note-a"],
      },
      operatorNotes: ["op-1"],
    });
    const b = buildPlatformSurvivalSummary({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: "2026-03-20T08:00:00 ET",
      runMode: "both",
      pp,
      ud: a.ud,
      operatorNotes: ["op-1"],
    });
    expect(a).toEqual(b);
    expect(a.mathModelsWiring.juice_adjust_reexports_math_models).toBe(true);
  });

  it("formatPlatformSurvivalMarkdown includes key sections", () => {
    const s = buildPlatformSurvivalSummary({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: "2026-03-20T08:00:00 ET",
      runMode: "partial",
      pp: buildPpSurvivalSnapshot({
        rawScrapedProps: 10,
        mergeMatchedProps: 8,
        afterEvCompute: 7,
        afterMinEdge: 6,
        afterMinLegEvBeforeAdjEv: 5,
        afterAdjEvThreshold: 4,
        afterPlayerCap: 4,
        cardsBuiltPreTypeEvFilter: null,
        cardsAfterPerTypeMinEv: null,
        cardsAfterSelectionEngine: null,
        cardsExported: null,
        exportedByFlexType: {},
        thresholds: {
          minEdgePerLeg: 0.015,
          minLegEv: 0.02,
          evAdjThresh: 0.0225,
          maxLegsPerPlayer: 1,
          volumeMode: false,
        },
        extraNotes: ["x"],
      }),
      ud: null,
      operatorNotes: ["PP early exit"],
    });
    const md = formatPlatformSurvivalMarkdown(s);
    expect(md).toContain("PrizePicks stage counts");
    expect(md).toContain("Operator interpretation");
    expect(md).toContain("PP early exit");
  });

  it("writePhase17iOperatorArtifacts writes json and md under data/reports", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "phase17i-"));
    writePhase17iOperatorArtifacts(tmp, {
      runTimestampEt: "2026-03-20T08:00:00 ET",
      runMode: "ud",
      platform: "ud",
      ppLegFunnel: null,
      ppThresholds: {
        minEdgePerLeg: 0.015,
        minLegEv: 0.02,
        evAdjThresh: 0.0225,
        maxLegsPerPlayer: 1,
        volumeMode: false,
      },
      ud: {
        rawScrapedProps: 1,
        mergedProps: 1,
        evComputed: 1,
        afterFilterEvPicks: 1,
        afterSiteFilter: 1,
        finalLegPoolForCards: 1,
        generatedTotal: 2,
        generatedByStructureId: { UD_2P_STD: 2 },
        generatedByFlexTypePreCap: { "2P": 2 },
        exportedTotal: 2,
        exportedByStructureId: { UD_2P_STD: 2 },
        exportedByFlexType: { "2P": 2 },
        maxCardsCap: 800,
        autoBoostSecondPass: false,
        usedSharedLegs: false,
        udMinLegEv: 0.01,
        udMinEdge: 0.006,
        udVolume: false,
        allowedStandardStructureIds: [],
        allowedFlexStructureIds: [],
        notes: [],
      },
      operatorNotes: ["t"],
    });
    const { jsonPath, mdPath } = getPlatformSurvivalReportPaths(tmp);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(j.schemaVersion).toBe(1);
    expect(j.ud.generatedByStructureId).toEqual({ UD_2P_STD: 2 });
  });

  it("juice_adjust.ts delegates leg EV / breakeven helpers to math_models (static proof)", () => {
    const p = path.join(__dirname, "..", "src", "ev", "juice_adjust.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("from '../../math_models/juice_adjust'");
    expect(src).toContain("juiceAwareLegEv");
    expect(src).toContain("fairBeFromTwoWayOdds");
    expect(src).toContain("trueBeFromOdds");
    expect(src).toContain("structureBreakeven");
  });
});
