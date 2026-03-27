import fs from "fs";
import os from "os";
import path from "path";
import { captureOddsSnapshot } from "../src/tracking/capture_odds_snapshot";
import { saveCardsToTracker } from "../src/tracking/tracker_schema";
import type { CardEvResult } from "../src/types";

function mkTmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16p-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "tracking"), { recursive: true });
  return root;
}

describe("Phase 16P snapshot and gameStart coverage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("capture snapshot writes reconciler-compatible format and is rerun-safe", () => {
    const root = mkTmpRoot();
    jest.spyOn(process, "cwd").mockReturnValue(root);
    const cache = {
      ts: Date.parse("2026-03-20T01:30:00.000Z"),
      data: [
        { league: "NBA", player: "A", stat: "points", line: 10.5, overOdds: -120, underOdds: 100, book: "FanDuel" },
      ],
    };
    fs.writeFileSync(path.join(root, "data", "odds_cache.json"), JSON.stringify(cache, null, 2), "utf8");

    const first = captureOddsSnapshot({ rootDir: root });
    const second = captureOddsSnapshot({ rootDir: root });
    expect(first.written).toBe(true);
    expect(first.rows).toBe(1);
    expect(second.written).toBe(false);
  });

  it("tracker saves gameStartTime from leg csv when pick.startTime is missing", () => {
    const root = process.cwd();
    const legsPath = path.join(root, "prizepicks-legs.csv");
    const pendingPath = path.join(root, "data", "tracking", "pending_cards.json");
    const prevLegs = fs.existsSync(legsPath) ? fs.readFileSync(legsPath, "utf8") : null;
    const prevPending = fs.existsSync(pendingPath) ? fs.readFileSync(pendingPath, "utf8") : null;
    try {
      fs.writeFileSync(
        legsPath,
        [
          "Sport,id,player,team,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h,leg_key,leg_label",
          "NBA,pp-1,A,AAA,points,10.5,NBA,FD,-120,100,0.55,0.05,0.05,2026-03-20T01:00:00 ET,2026-03-20T02:00:00.000Z,TRUE,pp:a:points:10.5:over:game,A - Points - 10.5",
        ].join("\n"),
        "utf8"
      );

      const card = {
        flexType: "3P",
        structureId: "3P",
        site: "prizepicks",
        cardEv: 0.1,
        breakevenGap: 0.01,
        kellyResult: { recommendedStake: 10 },
        legs: [
          {
            side: "over",
            pick: {
              id: "pp-1",
              legKey: "pp:a:points:10.5:over:game",
              player: "A",
              stat: "points",
              line: 10.5,
              trueProb: 0.55,
              overOdds: -120,
              underOdds: 100,
              book: "FanDuel",
              league: "NBA",
              site: "prizepicks",
              team: null,
              opponent: null,
              startTime: null,
            },
          },
        ],
      } as unknown as CardEvResult;

      saveCardsToTracker([card], { maxCards: 1 });
      const pending = JSON.parse(
        fs.readFileSync(pendingPath, "utf8")
      );
      const leg = pending.cards[0].legs[0];
      expect(leg.gameStartTime).toBe("2026-03-20T02:00:00.000Z");
    } finally {
      if (prevLegs == null) fs.rmSync(legsPath, { force: true });
      else fs.writeFileSync(legsPath, prevLegs, "utf8");
      if (prevPending == null) fs.rmSync(pendingPath, { force: true });
      else fs.writeFileSync(pendingPath, prevPending, "utf8");
    }
  });
});

