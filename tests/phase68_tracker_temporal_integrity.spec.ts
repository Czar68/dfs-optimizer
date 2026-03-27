import fs from "fs";
import os from "os";
import path from "path";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import { buildTrackerTemporalIntegrityReport } from "../src/reporting/export_tracker_temporal_integrity";
import {
  computeTemporalIntegritySnapshot,
  enrichTrackerGameStartTimes,
  isValidGameStartTime,
} from "../src/tracking/tracker_temporal_integrity";

function mkRow(partial: Partial<PerfTrackerRow>): PerfTrackerRow {
  return {
    date: "2026-03-20",
    leg_id: "leg-1",
    player: "Player A",
    stat: "points",
    line: 20.5,
    book: "fanduel",
    trueProb: 0.55,
    projectedEV: 0.05,
    playedEV: 0.05,
    kelly: 0.1,
    card_tier: 1,
    result: 1,
    ...partial,
  };
}

describe("Phase 68 tracker temporal integrity", () => {
  it("fills gameStartTime from legs CSV by leg_id (deterministic)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p68-csv-"));
    const csvPath = path.join(root, "prizepicks-legs.csv");
    const headers =
      "id,player,stat,line,book,league,trueProb,legEv,overOdds,underOdds,gameTime,team,opponent\n";
    const line =
      "leg-1,Player A,points,20.5,fanduel,NBA,0.55,0.05,-110,-110,2026-03-20T23:00:00.000Z,LAL,BOS\n";
    fs.writeFileSync(csvPath, headers + line, "utf8");

    const rows = [mkRow({ leg_id: "leg-1", gameStartTime: undefined })];
    const r = enrichTrackerGameStartTimes(rows, { rootDir: root, persist: false });
    expect(r.rowsBackfilledThisPass).toBe(1);
    expect(rows[0].gameStartTime).toBe("2026-03-20T23:00:00.000Z");
    expect(r.sourceAttribution.from_legs_csv).toBe(1);
  });

  it("preserves valid existing gameStartTime and does not count as backfill", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p68-keep-"));
    const csvPath = path.join(root, "prizepicks-legs.csv");
    fs.writeFileSync(
      csvPath,
      "id,player,stat,line,book,league,trueProb,legEv,gameTime\n" +
        "leg-1,P,s,1,b,NBA,0.5,0,2099-01-01T00:00:00.000Z\n",
      "utf8"
    );
    const existing = "2026-03-20T20:00:00.000Z";
    const rows = [mkRow({ leg_id: "leg-1", gameStartTime: existing })];
    const r = enrichTrackerGameStartTimes(rows, { rootDir: root, persist: false });
    expect(rows[0].gameStartTime).toBe(existing);
    expect(r.rowsAlreadyTimed).toBe(1);
    expect(r.rowsBackfilledThisPass).toBe(0);
  });

  it("refuses ambiguous leg_id candidates (conflicting times in JSON)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p68-amb-"));
    const jpath = path.join(root, "data", "output_logs");
    fs.mkdirSync(jpath, { recursive: true });
    const jsonPath = path.join(jpath, "prizepicks-legs.json");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify([
        {
          id: "leg-x",
          player: "Player A",
          stat: "points",
          line: 20.5,
          startTime: "2026-03-20T22:00:00.000Z",
        },
        {
          id: "leg-x",
          player: "Player A",
          stat: "points",
          line: 20.5,
          startTime: "2026-03-20T23:00:00.000Z",
        },
      ]),
      "utf8"
    );

    const rows = [mkRow({ leg_id: "leg-x", gameStartTime: undefined })];
    const r = enrichTrackerGameStartTimes(rows, { rootDir: root, persist: false });
    expect(r.rowsBackfilledThisPass).toBe(0);
    expect(r.skippedConflicting).toBe(1);
    expect(rows[0].gameStartTime).toBeUndefined();
    expect(r.reasonBreakdownUntimed.ambiguous_or_conflicting_candidates).toBeGreaterThanOrEqual(1);
  });

  it("invalid non-empty gameStartTime is skipped and not overwritten from CSV", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p68-inv-"));
    const csvPath = path.join(root, "prizepicks-legs.csv");
    fs.writeFileSync(
      csvPath,
      "id,player,stat,line,book,league,trueProb,legEv,gameTime\n" +
        "leg-1,Player A,points,20.5,fanduel,NBA,0.55,0.05,2026-03-20T23:00:00.000Z\n",
      "utf8"
    );
    const rows = [mkRow({ leg_id: "leg-1", gameStartTime: "not-a-date" })];
    expect(isValidGameStartTime(rows[0].gameStartTime)).toBe(false);
    const r = enrichTrackerGameStartTimes(rows, { rootDir: root, persist: false });
    expect(rows[0].gameStartTime).toBe("not-a-date");
    expect(r.skippedInvalidExisting).toBe(1);
    expect(r.reasonBreakdownUntimed.invalid_existing_game_start).toBeGreaterThanOrEqual(1);
  });

  it("computeTemporalIntegritySnapshot and report shape are deterministic", () => {
    const rows = [
      mkRow({ result: 1, gameStartTime: "2026-03-20T12:00:00.000Z" }),
      mkRow({ result: 0, leg_id: "b", gameStartTime: undefined }),
    ];
    const snap = computeTemporalIntegritySnapshot(rows);
    expect(snap.totalRows).toBe(2);
    expect(snap.resolvedRows).toBe(2);
    expect(snap.resolvedRowsMissingGameStartTime).toBe(1);

    const enrichment = enrichTrackerGameStartTimes([mkRow({ gameStartTime: undefined })], {
      rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "p68-empty-")),
      persist: false,
    });
    const report = buildTrackerTemporalIntegrityReport({
      rowsBeforeMutation: rows,
      rowsAfterMutation: rows,
      enrichment,
      applied: false,
      perfTrackerWritten: false,
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
    });
    expect(report.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(report.before.totalRows).toBe(2);
    expect(report.deltas).toHaveProperty("resolvedGameStartCoverageRate");
    expect(report.enrichment.fromSnapshotEvent).toBe(0);
    expect(typeof report.impliedProbRecoveryOutlook).toBe("string");
  });

  it("newly timed resolved row increases resolved coverage in snapshot", () => {
    const beforeRows = [mkRow({ result: 1, gameStartTime: undefined })];
    const afterRows = [mkRow({ result: 1, gameStartTime: "2026-03-20T12:00:00.000Z" })];
    const b = computeTemporalIntegritySnapshot(beforeRows);
    const a = computeTemporalIntegritySnapshot(afterRows);
    expect(b.resolvedGameStartCoverageRate).toBe(0);
    expect(a.resolvedGameStartCoverageRate).toBe(1);
  });
});
