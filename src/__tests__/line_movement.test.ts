// src/__tests__/line_movement.test.ts
// Line movement: classifyMovement, enrichLegsWithMovement sidecar schema, loadPriorSnapshot no-prior.

import path from "path";
import fs from "fs";
import {
  classifyMovement,
  enrichLegsWithMovement,
  loadPriorSnapshot,
  formatRunTsForSnapshot,
  EnrichLegsWithMovementOptions,
} from "../line_movement";
import type { EvPick, PlayerPropOdds } from "../types";

const LINE_SNAPSHOTS_DIR = path.join(process.cwd(), "data", "line_snapshots");
const OUTPUT_DIR = path.join(process.cwd(), "data", "output_logs");

function makeEvPick(overrides: Partial<EvPick> & { player: string; stat: string; line: number; outcome: "over" | "under" }): EvPick {
  const base: EvPick = {
    id: "ud-1",
    sport: "NBA",
    site: "underdog",
    player: "",
    team: null,
    opponent: null,
    stat: "points",
    line: 0,
    outcome: "over",
    trueProb: 0.55,
    edge: 0.05,
    legEv: 0.02,
    overOdds: -110,
    underOdds: -110,
    book: "Pinnacle",
    league: "NBA",
    projectionId: "",
    gameId: null,
    startTime: null,
    fairOdds: 0.5,
    isNonStandardOdds: false,
    scoringWeight: 1,
  };
  return { ...base, ...overrides };
}

function makePriorProp(player: string, stat: string, line: number): PlayerPropOdds {
  return {
    sport: "NBA",
    player,
    team: "LAL",
    opponent: "BOS",
    league: "NBA",
    stat: stat as PlayerPropOdds["stat"],
    line,
    overOdds: -110,
    underOdds: -110,
    book: "Pinnacle",
    eventId: "e1",
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
  };
}

describe("formatRunTsForSnapshot", () => {
  it("formats date as YYYYMMDD-HHMM", () => {
    const d = new Date(2026, 2, 14, 6, 5);
    expect(formatRunTsForSnapshot(d)).toBe("20260314-0605");
  });
});

describe("classifyMovement", () => {
  it("classifies over + line up 2 as strong_against", () => {
    const pick = makeEvPick({ player: "LeBron James", stat: "points", line: 22, outcome: "over" });
    const prior = [makePriorProp("LeBron James", "points", 20)];
    const r = classifyMovement(pick, prior);
    expect(r.category).toBe("strong_against");
    expect(r.delta).toBe(2);
    expect(r.priorLine).toBe(20);
    expect(r.currentLine).toBe(22);
  });

  it("classifies over + line up 1 as moderate_against", () => {
    const pick = makeEvPick({ player: "LeBron James", stat: "points", line: 21, outcome: "over" });
    const prior = [makePriorProp("LeBron James", "points", 20)];
    const r = classifyMovement(pick, prior);
    expect(r.category).toBe("moderate_against");
    expect(r.delta).toBe(1);
  });

  it("classifies over + line down 1 as favorable", () => {
    const pick = makeEvPick({ player: "LeBron James", stat: "points", line: 19, outcome: "over" });
    const prior = [makePriorProp("LeBron James", "points", 20)];
    const r = classifyMovement(pick, prior);
    expect(r.category).toBe("favorable");
    expect(r.delta).toBe(-1);
  });

  it("classifies under + line down 2 as strong_against", () => {
    const pick = makeEvPick({ player: "LeBron James", stat: "points", line: 18, outcome: "under" });
    const prior = [makePriorProp("LeBron James", "points", 20)];
    const r = classifyMovement(pick, prior);
    expect(r.category).toBe("strong_against");
    expect(r.delta).toBe(-2);
  });

  it("returns no_prior when no matching prior", () => {
    const pick = makeEvPick({ player: "Unknown Player", stat: "points", line: 20, outcome: "over" });
    const prior = [makePriorProp("LeBron James", "points", 20)];
    const r = classifyMovement(pick, prior);
    expect(r.category).toBe("no_prior");
    expect(r.delta).toBe(0);
    expect(r.priorLine).toBe(20);
    expect(r.currentLine).toBe(20);
  });
});

describe("loadPriorSnapshot", () => {
  it("returns null when line_snapshots dir does not exist (no crash)", () => {
    const currentRunTs = "20260316-1200";
    const hadDir = fs.existsSync(LINE_SNAPSHOTS_DIR);
    if (hadDir) return;
    const result = loadPriorSnapshot(currentRunTs);
    expect(result).toBeNull();
  });
});

describe("enrichLegsWithMovement", () => {
  const sidecarPath = path.join(OUTPUT_DIR, "line_movement.csv");

  beforeAll(() => {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it("writes sidecar with expected schema (leg_id, player, stat, delta, category, priorLine, currentLine, priorRunTs)", () => {
    const priorProps = [
      makePriorProp("LeBron James", "points", 20),
      makePriorProp("Anthony Davis", "rebounds", 10),
    ];
    const legs: EvPick[] = [
      makeEvPick({ id: "ud-1", player: "LeBron James", stat: "points", line: 19, outcome: "over" }),
      makeEvPick({ id: "ud-2", player: "Anthony Davis", stat: "rebounds", line: 11, outcome: "over" }),
    ];
    const priorRunTs = "20260315-0600";
    enrichLegsWithMovement(legs, priorProps, priorRunTs);

    expect(legs[0].lineMovement).toBeDefined();
    expect(legs[0].lineMovement && "category" in legs[0].lineMovement && legs[0].lineMovement.category).toBe("favorable");
    expect(legs[1].lineMovement && "category" in legs[1].lineMovement && legs[1].lineMovement.category).toBe("moderate_against");

    expect(fs.existsSync(sidecarPath)).toBe(true);
    const raw = fs.readFileSync(sidecarPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    expect(lines[0]).toBe("leg_id,player,stat,delta,category,priorLine,currentLine,priorRunTs");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const row1 = lines[1].split(",");
    expect(row1[0]).toBe("ud-1");
    expect(row1[4]).toBe("favorable");
    const row2 = lines[2].split(",");
    expect(row2[0]).toBe("ud-2");
    expect(row2[4]).toBe("moderate_against");
  });

  it("appendToExisting appends rows to existing file", () => {
    const priorProps = [makePriorProp("Curry", "points", 25)];
    const legs: EvPick[] = [
      makeEvPick({ id: "ud-append-1", player: "Curry", stat: "points", line: 24, outcome: "over" }),
    ];
    const priorRunTs = "20260315-0700";
    fs.writeFileSync(
      sidecarPath,
      "leg_id,player,stat,delta,category,priorLine,currentLine,priorRunTs\npp-1,PP Player,points,-0.5,favorable,20,19.5,20260314-0600",
      "utf8"
    );
    const opts: EnrichLegsWithMovementOptions = { appendToExisting: true };
    enrichLegsWithMovement(legs, priorProps, priorRunTs, opts);

    const raw = fs.readFileSync(sidecarPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    expect(lines[0]).toBe("leg_id,player,stat,delta,category,priorLine,currentLine,priorRunTs");
    expect(lines.some((l) => l.startsWith("pp-1,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("ud-append-1,"))).toBe(true);
  });
});
