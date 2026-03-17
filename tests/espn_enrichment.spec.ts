/**
 * ESPN enrichment: enrichLegs blocks Out/Suspended/IR and sets espnStatus on legs.
 * ENABLE_ESPN_ENRICHMENT: applyEspnAdjEv nudges adjEv by vsLineGap; enrichLegsWithEspn gates on flag.
 */

import { EvPick, MergedPick } from "../src/types";

jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }));

import { enrichLegs, enrichLegsWithEspn, applyEspnAdjEv } from "../src/espn_enrichment";
const fetchMock = require("node-fetch").default as jest.Mock;

const baseLeg = (overrides: Partial<EvPick>): EvPick =>
  ({
    id: "pp-1-pts-22.5",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "LeBron James",
    team: "LAL",
    opponent: "BOS",
    stat: "points",
    line: 22.5,
    projectionId: "1",
    gameId: "g1",
    startTime: null,
    outcome: "over",
    trueProb: 0.58,
    fairOdds: 0.72,
    edge: 0.08,
    book: "DraftKings",
    overOdds: -120,
    underOdds: 100,
    legEv: 0.08,
    isNonStandardOdds: false,
    scoringWeight: 1.0,
    ...overrides,
  }) as EvPick;

describe("ESPN enrichment", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it("removes BLOCKED (Out) leg and keeps Active leg with espnStatus set", async () => {
    process.env.ESPN_ENRICHMENT_ENABLED = "true";
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/athletes")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: "1", fullName: "LeBron James", status: { type: { name: "Out" } } },
                { id: "2", fullName: "Anthony Davis", status: { type: { name: "Active" } } },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const legs: EvPick[] = [
      baseLeg({ id: "leg-out", player: "LeBron James" }),
      baseLeg({ id: "leg-active", player: "Anthony Davis" }),
    ];

    const result = await enrichLegs(legs);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("leg-active");
    expect(result[0]!.player).toBe("Anthony Davis");
    expect((result[0] as EvPick & { espnStatus?: string }).espnStatus).toBe("Active");
    process.env.ESPN_ENRICHMENT_ENABLED = "";
  });
});

describe("applyEspnAdjEv", () => {
  const savedEnv = process.env.ENABLE_ESPN_ENRICHMENT;

  afterEach(() => {
    process.env.ENABLE_ESPN_ENRICHMENT = savedEnv;
  });

  it("positive vsLineGap nudges adjEv up", () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "true";
    const leg = baseLeg({
      line: 20,
      legEv: 0.10,
      espnEnrichment: { last5Avg: 24, last5Games: 5, vsLineGap: 4, fetchedAt: new Date().toISOString() },
    });
    applyEspnAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    expect(leg.adjEv!).toBeGreaterThan(0.10);
  });

  it("negative vsLineGap nudges adjEv down", () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "true";
    const leg = baseLeg({
      line: 20,
      legEv: 0.10,
      espnEnrichment: { last5Avg: 16, last5Games: 5, vsLineGap: -4, fetchedAt: new Date().toISOString() },
    });
    applyEspnAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    expect(leg.adjEv!).toBeLessThan(0.10);
  });

  it("nudge is capped at +15% even for large vsLineGap", () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "true";
    const leg = baseLeg({
      line: 10,
      legEv: 0.10,
      espnEnrichment: { last5Avg: 50, last5Games: 5, vsLineGap: 40, fetchedAt: new Date().toISOString() },
    });
    applyEspnAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    expect(leg.adjEv!).toBeLessThanOrEqual(0.10 * 1.15 + 0.0001);
  });

  it("nudge is capped at -15% even for large negative vsLineGap", () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "true";
    const leg = baseLeg({
      line: 30,
      legEv: 0.10,
      espnEnrichment: { last5Avg: 0, last5Games: 5, vsLineGap: -30, fetchedAt: new Date().toISOString() },
    });
    applyEspnAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    expect(leg.adjEv!).toBeGreaterThanOrEqual(0.10 * 0.85 - 0.0001);
  });

  it("returns leg unchanged when espnEnrichment is undefined", () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "true";
    const leg = baseLeg({ legEv: 0.10 });
    const before = leg.adjEv ?? leg.legEv;
    applyEspnAdjEv(leg);
    expect(leg.adjEv).toBeUndefined();
    expect(leg.legEv).toBe(0.10);
    expect(leg.legEv).toBe(before);
  });

  it("returns leg unchanged when flag is false", () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "";
    const leg = baseLeg({
      legEv: 0.10,
      espnEnrichment: { last5Avg: 24, last5Games: 5, vsLineGap: 4, fetchedAt: new Date().toISOString() },
    });
    applyEspnAdjEv(leg);
    expect(leg.adjEv).toBeUndefined();
    expect(leg.legEv).toBe(0.10);
  });
});

describe("enrichLegsWithEspn", () => {
  const savedEnv = process.env.ENABLE_ESPN_ENRICHMENT;

  afterEach(() => {
    process.env.ENABLE_ESPN_ENRICHMENT = savedEnv;
  });

  it("returns legs unchanged when FLAGS.espnEnrichment is false", async () => {
    process.env.ENABLE_ESPN_ENRICHMENT = "";
    const legs: MergedPick[] = [
      { sport: "NBA", site: "prizepicks", league: "NBA", player: "A", team: null, opponent: null, stat: "points", line: 20, projectionId: "1", gameId: null, startTime: null, book: "DK", overOdds: -110, underOdds: -110, trueProb: 0.52, fairOverOdds: -108, fairUnderOdds: -108, isDemon: false, isGoblin: false, isPromo: false, scoringWeight: 1.0, isNonStandardOdds: false } as MergedPick,
    ];
    const result = await enrichLegsWithEspn(legs);
    expect(result).toBe(legs);
    expect(result).toHaveLength(1);
    expect((result[0] as MergedPick & { espnEnrichment?: unknown }).espnEnrichment).toBeUndefined();
  });
});
