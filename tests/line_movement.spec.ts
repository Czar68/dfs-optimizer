/**
 * tests/line_movement.spec.ts
 * Unit tests for line movement: classifyMovement, enrichLegsWithMovement,
 * writeLineSnapshot (mock skip), loadPriorSnapshot (3h gap).
 */

import fs from "fs";
import path from "path";
import {
  classifyMovement,
  enrichLegsWithMovement,
  writeLineSnapshot,
  loadPriorSnapshot,
  formatRunTsForSnapshot,
} from "../src/line_movement";
import type { EvPick, PlayerPropOdds } from "../src/types";

function makePick(overrides: Partial<EvPick>): EvPick {
  return {
    id: "leg-1",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "LeBron James",
    team: null,
    opponent: null,
    stat: "points",
    line: 22,
    projectionId: "p1",
    gameId: null,
    startTime: null,
    outcome: "over",
    trueProb: 0.55,
    fairOdds: -122,
    edge: 0.05,
    book: "draftkings",
    overOdds: -110,
    underOdds: -110,
    legEv: 0.02,
    isNonStandardOdds: false,
    scoringWeight: 1,
    ...overrides,
  };
}

function makePriorRow(overrides: Partial<PlayerPropOdds>): PlayerPropOdds {
  return {
    sport: "NBA",
    player: "LeBron James",
    team: null,
    opponent: null,
    league: "NBA",
    stat: "points",
    line: 22,
    overOdds: -110,
    underOdds: -110,
    book: "pinnacle",
    eventId: null,
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
    ...overrides,
  };
}

describe("classifyMovement", () => {
  it("pick=over, line moved +2.5 → strong_against", () => {
    const pick = makePick({ outcome: "over", line: 24.5 });
    const priorProps = [makePriorRow({ player: "LeBron James", stat: "points", line: 22 })];
    const result = classifyMovement(pick, priorProps);
    expect(result.category).toBe("strong_against");
    expect(result.delta).toBe(2.5);
    expect(result.priorLine).toBe(22);
    expect(result.currentLine).toBe(24.5);
  });

  it("pick=over, line moved -1.5 → favorable", () => {
    const pick = makePick({ outcome: "over", line: 20.5 });
    const priorProps = [makePriorRow({ player: "LeBron James", stat: "points", line: 22 })];
    const result = classifyMovement(pick, priorProps);
    expect(result.category).toBe("favorable");
    expect(result.delta).toBe(-1.5);
  });

  it("pick=under, line moved -2.0 → strong_against", () => {
    const pick = makePick({ outcome: "under", line: 20 });
    const priorProps = [makePriorRow({ player: "LeBron James", stat: "points", line: 22 })];
    const result = classifyMovement(pick, priorProps);
    expect(result.category).toBe("strong_against");
    expect(result.delta).toBe(-2);
  });

  it("no prior match → no_prior", () => {
    const pick = makePick({ player: "Unknown Player", stat: "points", line: 22 });
    const priorProps = [makePriorRow({ player: "LeBron James", stat: "points", line: 22 })];
    const result = classifyMovement(pick, priorProps);
    expect(result.category).toBe("no_prior");
    expect(result.delta).toBe(0);
  });
});

describe("enrichLegsWithMovement", () => {
  const priorProps = [
    makePriorRow({ player: "LeBron James", stat: "points", line: 22 }),
  ];

  it("BLOCK_ENABLED=true, strong_against leg is removed from output", () => {
    const orig = process.env.LINE_MOVEMENT_BLOCK_ENABLED;
    process.env.LINE_MOVEMENT_BLOCK_ENABLED = "true";
    const leg = makePick({ outcome: "over", line: 24.5 });
    const legs = [leg];
    const out = enrichLegsWithMovement(legs, priorProps, "20260314-0300");
    expect(out).toHaveLength(0);
    process.env.LINE_MOVEMENT_BLOCK_ENABLED = orig;
  });

  it("BLOCK_ENABLED=false, strong_against leg stays and has lineMovement set", () => {
    const orig = process.env.LINE_MOVEMENT_BLOCK_ENABLED;
    process.env.LINE_MOVEMENT_BLOCK_ENABLED = "false";
    const leg = makePick({ outcome: "over", line: 24.5 });
    const legs = [leg];
    const out = enrichLegsWithMovement(legs, priorProps, "20260314-0300");
    expect(out).toHaveLength(1);
    const lm = out[0].lineMovement;
    expect(lm && "category" in lm && lm.category).toBe("strong_against");
    process.env.LINE_MOVEMENT_BLOCK_ENABLED = orig;
  });
});

describe("writeLineSnapshot", () => {
  const dir = path.join(process.cwd(), "data", "line_snapshots");
  const testFile = path.join(dir, "20260314-0600.json");

  afterEach(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  it("USE_MOCK_ODDS=1 → no file written", () => {
    const orig = process.env.USE_MOCK_ODDS;
    process.env.USE_MOCK_ODDS = "1";
    if (fs.existsSync(dir)) {
      const before = fs.readdirSync(dir).length;
      writeLineSnapshot([makePriorRow({})], "20260314-0600");
      const after = fs.readdirSync(dir).length;
      expect(after).toBe(before);
    } else {
      writeLineSnapshot([makePriorRow({})], "20260314-0600");
      expect(fs.existsSync(testFile)).toBe(false);
    }
    process.env.USE_MOCK_ODDS = orig;
  });
});

describe("loadPriorSnapshot", () => {
  it("invalid currentRunTs format → null", () => {
    const result = loadPriorSnapshot("invalid");
    expect(result).toBeNull();
  });

  it("when dir exists and has file ≥ 3h old, returns props and priorRunTs", () => {
    const dir = path.join(process.cwd(), "data", "line_snapshots");
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return;
    const withMs = files.map((f) => ({ name: f, ms: parseFilename(f) })).filter((x) => x.ms != null);
    if (withMs.length === 0) return;
    const oldest = withMs.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0))[0];
    const currentRunTs = formatRunTsForSnapshot(new Date((oldest!.ms ?? 0) + 4 * 60 * 60 * 1000));
    const result = loadPriorSnapshot(currentRunTs);
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.props)).toBe(true);
    expect(typeof result!.priorRunTs).toBe("string");
  });
});

function parseFilename(name: string): number | null {
  const base = name.replace(".json", "");
  const match = base.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  return new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10), parseInt(h!, 10), parseInt(min!, 10), 0, 0).getTime();
}
