import fs from "fs";
import os from "os";
import path from "path";
import {
  buildFeatureOutcomeValidationArtifact,
  FEATURE_OUTCOME_VALIDATION_SCHEMA_VERSION,
  formatFeatureOutcomeValidationJson,
  formatFeatureOutcomeValidationMarkdown,
  getFeatureOutcomeValidationPaths,
  writeFeatureOutcomeValidationArtifacts,
} from "../src/reporting/feature_outcome_validation_report";
import type { EvPick } from "../src/types";

function basePick(id: string): EvPick {
  return {
    id,
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "X",
    team: null,
    opponent: null,
    stat: "points",
    line: 20,
    projectionId: "p",
    gameId: null,
    startTime: null,
    outcome: "over",
    trueProb: 0.5,
    fairOdds: -110,
    edge: 0,
    book: null,
    overOdds: null,
    underOdds: null,
    legEv: 0,
    isNonStandardOdds: false,
  };
}

function withSignals(
  id: string,
  signals: { m: number; u: number; e: number; d: number },
  graded: "hit" | "miss" | "push"
): EvPick {
  return {
    ...basePick(id),
    gradedLegOutcome: graded,
    featureSignals: {
      subjectId: id,
      asOfUtc: "2025-03-22T12:00:00.000Z",
      signals: {
        minutes_signal: signals.m,
        usage_signal: signals.u,
        environment_signal: signals.e,
        defense_signal: signals.d,
      },
    },
  };
}

function mdHeaders(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) out.push(line.slice(3).trim());
  }
  return out;
}

describe("Phase 98 — feature outcome validation report", () => {
  const t = "2026-03-22T00:00:00.000Z";

  it("deterministic JSON shape and repeatability", () => {
    const picks = [
      withSignals("a", { m: 0.1, u: 0.5, e: 0.5, d: 0.5 }, "hit"),
      withSignals("b", { m: 0.7, u: 0.5, e: 0.5, d: 0.5 }, "miss"),
    ];
    const a1 = buildFeatureOutcomeValidationArtifact(picks, t);
    const a2 = buildFeatureOutcomeValidationArtifact(picks, t);
    expect(a1.schemaVersion).toBe(FEATURE_OUTCOME_VALIDATION_SCHEMA_VERSION);
    expect(formatFeatureOutcomeValidationJson(a1)).toBe(formatFeatureOutcomeValidationJson(a2));
    const parsed = JSON.parse(formatFeatureOutcomeValidationJson(a1)) as unknown;
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      generatedAtUtc: t,
      inputPickCount: 2,
      evaluationRowCount: 2,
    });
  });

  it("markdown section ordering (bucket defs then axes)", () => {
    const md = formatFeatureOutcomeValidationMarkdown(buildFeatureOutcomeValidationArtifact([], t));
    const h = mdHeaders(md);
    expect(h).toEqual([
      "Bucket definitions",
      "minutes_signal",
      "usage_signal",
      "environment_signal",
      "defense_signal",
    ]);
  });

  it("empty picks: zero rows and zero counts", () => {
    const a = buildFeatureOutcomeValidationArtifact([], t);
    expect(a.evaluationRowCount).toBe(0);
    expect(a.performance.minutes_signal.overall.count).toBe(0);
    expect(a.performance.defense_signal.high_bucket.hit_rate).toBe(0);
  });

  it("partial: no graded outcome on picks yields evaluationRowCount 0", () => {
    const a = buildFeatureOutcomeValidationArtifact([basePick("x")], t);
    expect(a.inputPickCount).toBe(1);
    expect(a.evaluationRowCount).toBe(0);
  });

  it("writeFeatureOutcomeValidationArtifacts writes json and md", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fov-"));
    const picks = [withSignals("z", { m: 0.5, u: 0.5, e: 0.5, d: 0.5 }, "hit")];
    const art = buildFeatureOutcomeValidationArtifact(picks, t);
    writeFeatureOutcomeValidationArtifacts(tmp, art);
    const { jsonPath, mdPath } = getFeatureOutcomeValidationPaths(tmp);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(jsonPath, "utf8")).schemaVersion).toBe(1);
    expect(fs.readFileSync(mdPath, "utf8")).toContain("minutes_signal");
  });
});
