import fs from "fs";
import os from "os";
import path from "path";
import {
  exportFeatureValidationPicks,
  formatFeatureValidationPicksJson,
  buildContextRecordsForFeatureValidation,
  buildEvPickFromTrackerLeg,
  resolveLegCsvRecord,
  findReconstructionLegMatch,
  mergeLegsFromJsonFiles,
} from "../src/reporting/feature_validation_export";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import { existingGroundedLegJsonPaths, loadLegsMap, type LegCsvRecord } from "../src/tracking/legs_csv_index";

function writeFixture(dir: string, opts: { orphanLegId?: boolean; noResult?: boolean }): void {
  const legId = "prizepicks-phase101-test-leg-over-20";
  const rows: PerfTrackerRow[] = [
    {
      date: "2025-06-01",
      leg_id: legId,
      player: "Test Player",
      stat: "points",
      line: 20,
      book: "FD",
      trueProb: 0.55,
      projectedEV: 0.02,
      playedEV: 0.02,
      kelly: 0.01,
      card_tier: 1,
      result: opts.noResult ? undefined : 1,
      side: "over",
      platform: "PP",
    },
  ];
  if (opts.orphanLegId) {
    rows.push({
      date: "2025-06-02",
      leg_id: "prizepicks-no-csv-match-999",
      player: "X",
      stat: "points",
      line: 10,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      result: 0,
    });
  }
  const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
  fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
  fs.writeFileSync(
    trackerPath,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8"
  );

  const leg: LegCsvRecord = {
    player: "Test Player",
    stat: "points",
    line: 20,
    book: "FD",
    league: "NBA",
    trueProb: 0.55,
    legEv: 0.02,
    overOdds: -110,
    underOdds: -110,
    opponent: "BOS",
  };
  const csvPath = path.join(dir, "prizepicks-legs.csv");
  const header =
    "id,player,stat,line,book,league,trueProb,legEv,overOdds,underOdds,opponent\n";
  fs.writeFileSync(
    csvPath,
    header +
      `${legId},${leg.player},${leg.stat},${leg.line},${leg.book},${leg.league},${leg.trueProb},${leg.legEv},${leg.overOdds},${leg.underOdds},${leg.opponent}\n`,
    "utf8"
  );
}

describe("Phase 101B — resolveLegCsvRecord suffix join", () => {
  it("matches legs CSV id with -over when tracker leg_id omits side token", () => {
    const row: PerfTrackerRow = {
      date: "2025-06-01",
      leg_id: "prizepicks-phase101b-points-20",
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      result: 1,
      side: "over",
    };
    const map = new Map<string, LegCsvRecord>();
    map.set("prizepicks-phase101b-points-20-over", {
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    });
    const leg = resolveLegCsvRecord(row, map);
    expect(leg).toBeDefined();
    expect(leg!.line).toBe(20);
  });

  it("mergeLegsFromJsonFiles fills ids missing from CSV only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101b-"));
    const map = new Map<string, LegCsvRecord>();
    fs.writeFileSync(
      path.join(dir, "prizepicks-legs.json"),
      JSON.stringify([
        {
          id: "prizepicks-json-only-1-points-1-over",
          player: "A",
          stat: "points",
          line: 1,
          league: "NBA",
          book: "FD",
          trueProb: 0.5,
          legEv: 0.01,
        },
      ]),
      "utf8"
    );
    mergeLegsFromJsonFiles(dir, map);
    expect(map.has("prizepicks-json-only-1-points-1-over")).toBe(true);
  });

  it("mergeLegsFromJsonFiles loads data/legs_archive dated JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101c-arch-"));
    fs.mkdirSync(path.join(dir, "data", "legs_archive"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "data", "legs_archive", "prizepicks-legs-20260219.json"),
      JSON.stringify([
        {
          id: "prizepicks-archived-json-leg-points-1-over",
          player: "A",
          stat: "points",
          line: 1,
          league: "NBA",
          book: "FD",
          trueProb: 0.5,
          legEv: 0.01,
        },
      ]),
      "utf8"
    );
    const map = new Map<string, LegCsvRecord>();
    mergeLegsFromJsonFiles(dir, map);
    expect(map.has("prizepicks-archived-json-leg-points-1-over")).toBe(true);
    expect(existingGroundedLegJsonPaths(dir).some((p) => p.includes("prizepicks-legs-20260219.json"))).toBe(
      true
    );
  });

  it("mergeLegsFromJsonFiles accepts leg_id when id is absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101c-legid-"));
    fs.writeFileSync(
      path.join(dir, "underdog-legs.json"),
      JSON.stringify([
        {
          leg_id: "underdog-legid-only-test-points-5-over",
          player: "B",
          stat: "points",
          line: 5,
          league: "NBA",
          book: "FD",
          trueProb: 0.5,
          legEv: 0.01,
        },
      ]),
      "utf8"
    );
    const map = new Map<string, LegCsvRecord>();
    mergeLegsFromJsonFiles(dir, map);
    expect(map.has("underdog-legid-only-test-points-5-over")).toBe(true);
  });
});

describe("Phase 101 — feature validation export", () => {
  it("exportFeatureValidationPicks joins tracker + legs and attaches signals + gradedLegOutcome", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101-"));
    writeFixture(dir, {});

    const { picks, stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath: path.join(dir, "data", "perf_tracker.jsonl"),
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
    });

    expect(stats.exported).toBe(1);
    expect(stats.skippedNoLeg).toBe(0);
    expect(stats.joinedByLegId).toBe(1);
    expect(stats.joinedByReconstruction).toBe(0);
    expect(picks).toHaveLength(1);
    expect(picks[0]!.featureValidationJoin?.method).toBe("leg_id");
    expect(picks[0]!.gradedLegOutcome).toBe("hit");
    expect(picks[0]!.featureSignals?.signals).toBeDefined();
    expect(picks[0]!.featureSignals?.signals.defense_signal).toBeGreaterThan(0);
  });

  it("deterministic JSON for same inputs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101-"));
    writeFixture(dir, {});
    const a = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath: path.join(dir, "data", "perf_tracker.jsonl"),
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
    });
    const b = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath: path.join(dir, "data", "perf_tracker.jsonl"),
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
    });
    expect(formatFeatureValidationPicksJson(a.picks)).toBe(formatFeatureValidationPicksJson(b.picks));
  });

  it("skips rows when leg_id missing from legs CSV", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101-"));
    writeFixture(dir, { orphanLegId: true });

    const { picks, stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath: path.join(dir, "data", "perf_tracker.jsonl"),
      legCsvPaths: [path.join(dir, "prizepicks-legs.csv")],
    });

    expect(stats.skippedNoLeg).toBe(1);
    expect(picks).toHaveLength(1);
  });

  it("buildContextRecordsForFeatureValidation is empty without opponent/historical/homeAway", () => {
    const row: PerfTrackerRow = {
      date: "2025-01-01",
      leg_id: "x",
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
    };
    const leg: LegCsvRecord = {
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    };
    expect(buildContextRecordsForFeatureValidation(row, leg)).toEqual([]);
  });

  it("buildEvPickFromTrackerLeg sets core fields", () => {
    const row: PerfTrackerRow = {
      date: "2025-01-01",
      leg_id: "prizepicks-abc-over-points-20",
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      trueProb: 0.5,
      projectedEV: 0.01,
      playedEV: 0.01,
      kelly: 0,
      card_tier: 1,
    };
    const leg: LegCsvRecord = {
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0.01,
    };
    const p = buildEvPickFromTrackerLeg(row, leg);
    expect(p.site).toBe("prizepicks");
    expect(p.id).toContain("2025-01-01");
  });
});

describe("Phase 101E — deterministic leg reconstruction", () => {
  it("findReconstructionLegMatch resolves when leg_id differs but fields match exactly", () => {
    const row: PerfTrackerRow = {
      date: "2025-06-01",
      leg_id: "prizepicks-tracker-only-id",
      player: "Test Player",
      stat: "points",
      line: 20,
      book: "FD",
      trueProb: 0.55,
      projectedEV: 0.02,
      playedEV: 0.02,
      kelly: 0.01,
      card_tier: 1,
      result: 1,
      side: "over",
      team: "MIA",
      opponent: "BOS",
      gameStartTime: "2025-06-01T19:00:00.000Z",
    };
    const csvPath = path.join(os.tmpdir(), `p101e-${Date.now()}.csv`);
    const header =
      "id,player,stat,line,book,league,trueProb,legEv,overOdds,underOdds,gameTime,team,opponent\n";
    fs.writeFileSync(
      csvPath,
      header +
        "prizepicks-csv-real-id-over,Test Player,points,20,FD,NBA,0.55,0.02,-110,-110,2025-06-01T19:00:00.000Z,MIA,BOS\n",
      "utf8"
    );
    const map = loadLegsMap([csvPath]);
    try {
      const m = findReconstructionLegMatch(row, map);
      expect(m?.legId).toBe("prizepicks-csv-real-id-over");
    } finally {
      fs.unlinkSync(csvPath);
    }
  });

  it("findReconstructionLegMatch returns undefined when two legs match", () => {
    const row: PerfTrackerRow = {
      date: "2025-06-01",
      leg_id: "x",
      player: "Dup",
      stat: "points",
      line: 10,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      result: 1,
      team: "",
      opponent: "",
    };
    const map = new Map<string, LegCsvRecord>();
    map.set("a-over", {
      player: "Dup",
      stat: "points",
      line: 10,
      book: "FD",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    });
    map.set("b-over", {
      player: "Dup",
      stat: "points",
      line: 10,
      book: "FD",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    });
    expect(findReconstructionLegMatch(row, map)).toBeUndefined();
  });

  it("exportFeatureValidationPicks sets joinedByReconstruction and featureValidationJoin", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p101e-exp-"));
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    const tr: PerfTrackerRow = {
      date: "2025-06-01",
      leg_id: "prizepicks-not-in-csv",
      player: "Reco Player",
      stat: "assists",
      line: 4,
      book: "FD",
      trueProb: 0.52,
      projectedEV: 0.02,
      playedEV: 0.02,
      kelly: 0.01,
      card_tier: 1,
      result: 1,
      side: "over",
      team: "LAL",
      opponent: "GSW",
    };
    fs.writeFileSync(trackerPath, JSON.stringify(tr) + "\n", "utf8");
    const csvPath = path.join(dir, "prizepicks-legs.csv");
    const header =
      "id,player,stat,line,book,league,trueProb,legEv,overOdds,underOdds,team,opponent\n";
    fs.writeFileSync(
      csvPath,
      header +
        "prizepicks-real-assists-4-over,Reco Player,assists,4,FD,NBA,0.52,0.02,-110,-110,LAL,GSW\n",
      "utf8"
    );
    const { picks, stats } = exportFeatureValidationPicks({
      cwd: dir,
      trackerPath,
      legCsvPaths: [csvPath],
    });
    expect(stats.joinedByReconstruction).toBe(1);
    expect(stats.joinedByLegId).toBe(0);
    expect(picks[0]!.featureValidationJoin?.method).toBe("reconstruction");
    expect(picks[0]!.featureValidationJoin?.matchedLegCsvId).toBe("prizepicks-real-assists-4-over");
    expect(picks[0]!.projectionId).toContain("prizepicks-real");
  });
});
