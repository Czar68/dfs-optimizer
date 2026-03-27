import fs from "fs";
import os from "os";
import path from "path";
import { enrichExistingTrackerStartTimes } from "../src/backfill_perf_tracker";
import { readTrackerRows } from "../src/perf_tracker_db";
import { buildOpsCoveragePlaybook } from "../src/tracking/export_ops_coverage_playbook";

describe("Phase 16V ops playbook + historical metadata harvest", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("harvests start time from oddsapi_today with minimal normalization", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16v-"));
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      JSON.stringify({
        date: "2026-03-20",
        leg_id: "pp-1",
        player: "Player A",
        stat: "points",
        line: 20.5,
        book: "fanduel",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
      }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "oddsapi_today.json"),
      JSON.stringify([
        {
          playerName: "Player A",
          statType: "points",
          line: 20.5,
          commenceTime: "2026-03-20T23:00:00Z",
          team: "UNK",
          opponent: "UNK",
        },
      ]),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = enrichExistingTrackerStartTimes(root);
    const rows = readTrackerRows();
    expect(out.enriched).toBe(1);
    expect(rows[0]?.gameStartTime).toBe("2026-03-20T23:00:00Z");
    expect(rows[0]?.team).toBeUndefined();
  });

  it("does not overwrite existing start time during additional harvest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16v-"));
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      JSON.stringify({
        date: "2026-03-20",
        leg_id: "pp-2",
        player: "Player B",
        stat: "rebounds",
        line: 10.5,
        book: "fanduel",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
        gameStartTime: "2026-03-20T22:00:00Z",
      }) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "data", "oddsapi_today.json"),
      JSON.stringify([
        {
          playerName: "Player B",
          statType: "rebounds",
          line: 10.5,
          commenceTime: "2026-03-20T23:00:00Z",
        },
      ]),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const out = enrichExistingTrackerStartTimes(root);
    const rows = readTrackerRows();
    expect(out.enriched).toBe(0);
    expect(out.skippedExisting).toBe(1);
    expect(rows[0]?.gameStartTime).toBe("2026-03-20T22:00:00Z");
  });

  it("playbook export shape and action ordering are deterministic", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16v-"));
    fs.mkdirSync(path.join(root, "data", "odds_snapshots"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "data", "perf_tracker.jsonl"),
      [
        JSON.stringify({
          date: "2026-03-20",
          leg_id: "a",
          player: "A",
          stat: "points",
          line: 10.5,
          book: "fd",
          trueProb: 0.55,
          projectedEV: 0.05,
          playedEV: 0.05,
          kelly: 0.1,
          card_tier: 1,
          result: 1,
        }),
        JSON.stringify({
          date: "2026-03-20",
          leg_id: "b",
          player: "B",
          stat: "points",
          line: 11.5,
          book: "fd",
          trueProb: 0.55,
          projectedEV: 0.05,
          playedEV: 0.05,
          kelly: 0.1,
          card_tier: 1,
          gameStartTime: "2026-03-20T20:00:00Z",
        }),
      ].join("\n") + "\n",
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const p = buildOpsCoveragePlaybook(root);
    expect(p.readiness.status).toBeDefined();
    expect(p.coverage.perf.totalRows).toBe(2);
    expect(Array.isArray(p.actionPlan)).toBe(true);
    expect(p.actionPlan[0]?.code).toBe("recover_missing_start_times");
    expect(p.actionPlan[0]?.priority).toBe(2);
    expect(Array.isArray(p.topRowActions)).toBe(true);
  });
});
