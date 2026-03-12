/**
 * Prod validation: daily-run, telegram test script, quota monitor, UD boost.
 */
import * as fs from "fs";
import * as path from "path";

describe("Daily-run validation", () => {
  it("daily-run.ps1 uses ErrorAction Continue so node stderr does not abort", () => {
    const p = path.join(process.cwd(), "scripts", "daily-run.ps1");
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toMatch(/ErrorActionPreference|Continue/);
    expect(content).toContain("run-both");
  });
});

describe("Telegram live test script", () => {
  it("test-telegram.ps1 exists and loads .env for Telegram test", () => {
    const p = path.join(process.cwd(), "scripts", "test-telegram.ps1");
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain(".env");
    expect(content).toContain("telegram_pusher");
    expect(content).toContain("testTelegramConnection");
  });
});

describe("Quota monitor", () => {
  it("quota-monitor.ps1 exists and alerts when OddsAPI remaining below threshold", () => {
    const p = path.join(process.cwd(), "scripts", "quota-monitor.ps1");
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("ALERT_THRESHOLD");
    expect(content).toContain("remaining");
    expect(content).toContain("odds_cache.json");
    expect(content).toMatch(/Quota Monitor|OddsAPI/);
  });
});

describe("UD boost real-slate", () => {
  it("run_underdog_optimizer auto-boost uses minLegEv 0.008 and volume mode", () => {
    const p = path.join(process.cwd(), "src", "run_underdog_optimizer.ts");
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("0.008");
    expect(content).toContain("buildUdCardsFromFiltered");
    expect(content).toContain("Auto boost");
    expect(content).toContain("ud_volume");
  });
});

describe("Bankroll flag", () => {
  it("run_optimizer logs Bankroll from CLI and run-both/daily-run pass --bankroll", () => {
    const runOpt = path.join(process.cwd(), "src", "run_optimizer.ts");
    const runBoth = path.join(process.cwd(), "scripts", "run-both.ps1");
    const dailyRun = path.join(process.cwd(), "scripts", "daily-run.ps1");
    const runOptContent = fs.readFileSync(runOpt, "utf8");
    expect(runOptContent).toContain("Bankroll:");
    expect(runOptContent).toContain("bankroll");
    const runBothContent = fs.readFileSync(runBoth, "utf8");
    expect(runBothContent).toContain("bankroll");
    expect(runBothContent).toMatch(/--bankroll/);
    const dailyContent = fs.readFileSync(dailyRun, "utf8");
    expect(dailyContent).toContain("bankroll");
  });
});

describe("Tier1 non-fragile", () => {
  it("build_innovative_cards classifyTier caps fragile cards at Tier2", () => {
    const p = path.join(process.cwd(), "src", "build_innovative_cards.ts");
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("Tier1 = premium only if not fragile");
    expect(content).toMatch(/classifyTier\([^)]+fragile/);
    expect(content).toContain("if (fragile)");
    expect(content).toContain("TIER2_MIN_KELLY) return 2");
  });
});

describe("Quota monitor OddsAPI", () => {
  it("quota-monitor.ps1 reads data/odds_cache.json and reports remaining requests", () => {
    const p = path.join(process.cwd(), "scripts", "quota-monitor.ps1");
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("odds_cache.json");
    expect(content).toContain("remaining");
    expect(content).toMatch(/ALERT|threshold/);
  });
});

describe("Perf tracker and calibration", () => {
  it("perf_tracker_db exports appendTrackerRow and readTrackerRows", () => {
    const db = require("../src/perf_tracker_db");
    expect(typeof db.appendTrackerRow).toBe("function");
    expect(typeof db.readTrackerRows).toBe("function");
    const rows = db.readTrackerRows();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("scrape_nba_leg_results mockFetchActual returns fetcher that yields hit/miss value", async () => {
    const { mockFetchActual } = require("../src/scrape_nba_leg_results");
    const hitFetcher = mockFetchActual(7.5, true);
    const missFetcher = mockFetchActual(7.5, false);
    expect(await hitFetcher("", "", "", 7.5)).toBe(8.5);
    expect(await missFetcher("", "", "", 7.5)).toBe(6.5);
  });

  it("calibrate_leg_ev computeBucketCalibrationsFromRows returns mult in [0.8, 1.5]", () => {
    const { computeBucketCalibrationsFromRows } = require("../src/calibrate_leg_ev");
    const rows = Array.from({ length: 5 }, (_, i) => ({
      date: "2026-02-22",
      leg_id: `leg-${i}`,
      player: "Test Player",
      stat: "points",
      line: 20.5,
      book: "fanduel",
      trueProb: 0.5,
      projectedEV: 0.02,
      playedEV: 0.02,
      kelly: 0.1,
      card_tier: 1,
      result: i < 3 ? 1 : 0,
    }));
    const cal = computeBucketCalibrationsFromRows(rows);
    expect(cal.length).toBe(1);
    expect(cal[0].mult).toBeGreaterThanOrEqual(0.8);
    expect(cal[0].mult).toBeLessThanOrEqual(1.5);
    expect(cal[0].histHit).toBeCloseTo(3 / 5, 10);
  });

  it("calibrate_leg_ev under bonus 0.05 when under hist > implied for PTS/REB", () => {
    const { computeBucketCalibrationsFromRows } = require("../src/calibrate_leg_ev");
    const rows = Array.from({ length: 5 }, (_, i) => ({
      date: "2026-02-22",
      leg_id: `leg-${i}`,
      player: "Test Player",
      stat: "points",
      line: 25.5,
      book: "fanduel",
      trueProb: 0.6,
      projectedEV: 0.02,
      playedEV: 0.02,
      kelly: 0.1,
      card_tier: 1,
      result: i < 2 ? 1 : 0,
    }));
    const cal = computeBucketCalibrationsFromRows(rows);
    expect(cal.length).toBe(1);
    expect(cal[0].histHit).toBeCloseTo(0.4, 10);
    expect(cal[0].implied).toBeCloseTo(0.6, 10);
    expect(cal[0].underBonus).toBe(0.05);
  });

  it("ESPN getStatValueFromBox maps points/rebounds/assists/3pm", () => {
    const { getStatValueFromBox } = require("../src/espn_boxscore");
    const box = { points: 22, rebounds: 9, assists: 5, threePointFieldGoalsMade: 2 };
    expect(getStatValueFromBox(box, "points")).toBe(22);
    expect(getStatValueFromBox(box, "rebounds")).toBe(9);
    expect(getStatValueFromBox(box, "assists")).toBe(5);
    expect(getStatValueFromBox(box, "3pm")).toBe(2);
  });

  it("fetchActualStatFromNba with mocked ESPN returns stat (no network)", async () => {
    const espn = require("../src/espn_boxscore");
    const { fetchActualStatFromNba, clearEspnDateCache } = require("../src/scrape_nba_leg_results");
    const spy = jest.spyOn(espn, "fetchAllPlayerStatsForDate").mockResolvedValue(
      new Map([["wendell carter", { points: 18, rebounds: 9, assists: 2, threePointFieldGoalsMade: 1 }]])
    );
    clearEspnDateCache();
    const actual = await fetchActualStatFromNba("2026-02-22", "Wendell Carter", "rebounds", 7.5);
    expect(actual).toBe(9);
    spy.mockRestore();
  });
});
