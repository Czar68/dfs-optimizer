/**
 * Phase 16L: Telegram high-EV digest — dedupe + per-platform cap helpers.
 */
import {
  dedupeCardsByLegSet,
  legSetKey,
  sortCardsForTelegramDigest,
  buildHighEvTelegramMessages,
} from "../src/notifications/telegram_high_ev_digest";
import type { CardEvResult, EvPick, FlexType } from "../src/types";

function pick(overrides: Partial<EvPick> = {}): EvPick {
  const base: EvPick = {
    id: "leg-a",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "A",
    team: "T1",
    opponent: "T2",
    stat: "points",
    line: 20,
    projectionId: "p1",
    gameId: "g1",
    startTime: null,
    outcome: "over",
    trueProb: 0.58,
    fairOdds: -110,
    edge: 0.08,
    book: null,
    overOdds: -110,
    underOdds: -110,
    legEv: 0.08,
    isNonStandardOdds: false,
  };
  return { ...base, ...overrides };
}

function card(
  partial: Partial<CardEvResult> & Pick<CardEvResult, "flexType" | "legs">
): CardEvResult {
  const legs = partial.legs;
  const n = legs.length;
  const avgProb = legs.reduce((s, l) => s + l.pick.trueProb, 0) / n;
  const defaults: CardEvResult = {
    flexType: partial.flexType,
    legs: partial.legs,
    stake: 1,
    totalReturn: 1.1,
    expectedValue: 0.1,
    winProbability: 0.2,
    cardEv: partial.cardEv ?? 0.1,
    winProbCash: 0.15,
    winProbAny: 0.25,
    avgProb,
    avgEdgePct: 5,
    hitDistribution: { [n]: 1 },
  };
  return { ...defaults, ...partial };
}

function renderSingleDigestMessage(
  cards: CardEvResult[],
  formatLine: (card: CardEvResult) => string,
  opts: { maxPerPlatform?: number; runLabel?: string } = {}
): string {
  const messages = buildHighEvTelegramMessages(cards, formatLine, {
    maxPerPlatform: opts.maxPerPlatform ?? 5,
    runLabel: opts.runLabel,
  });
  expect(messages).toHaveLength(1);
  return messages[0];
}

describe("Phase 16L telegram digest", () => {
  it("dedupeCardsByLegSet keeps higher cardEv for same legs", () => {
    const leg = pick({ id: "x1", player: "Jokic" });
    const a = card({
      flexType: "3P",
      site: "prizepicks",
      legs: [
        { pick: leg, side: "over" },
        { pick: { ...pick({ id: "x2" }), player: "Curry" }, side: "over" },
        { pick: { ...pick({ id: "x3" }), player: "Tatum" }, side: "over" },
      ],
      cardEv: 0.08,
    });
    const b = {
      ...a,
      cardEv: 0.12,
    };
    expect(legSetKey(a)).toBe(legSetKey(b));
    const out = dedupeCardsByLegSet([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].cardEv).toBe(0.12);
  });

  it("buildHighEvTelegramMessages caps per platform and splits PP vs UD", () => {
    const mkPp = (i: number, ev: number) =>
      card({
        flexType: "2P",
        site: "prizepicks",
        structureId: "2P",
        legs: [
          { pick: pick({ id: `pp-${i}-a`, player: `Pa${i}` }), side: "over" as const },
          { pick: pick({ id: `pp-${i}-b`, player: `Pb${i}` }), side: "over" as const },
        ],
        cardEv: ev,
      });
    const mkUd = (i: number, ev: number) =>
      card({
        flexType: "3P" as FlexType,
        site: "underdog",
        structureId: "UD_3P_STD",
        legs: [
          { pick: pick({ id: `ud-${i}-a`, player: `Ua${i}`, site: "underdog" }), side: "over" },
          { pick: pick({ id: `ud-${i}-b`, player: `Ub${i}`, site: "underdog" }), side: "over" },
          { pick: pick({ id: `ud-${i}-c`, player: `Uc${i}`, site: "underdog" }), side: "over" },
        ],
        cardEv: ev,
      });
    const many = [
      ...Array.from({ length: 8 }, (_, i) => mkPp(i, 0.08 + i * 0.001)),
      ...Array.from({ length: 8 }, (_, i) => mkUd(i, 0.08 + i * 0.001)),
    ];
    const msgs = buildHighEvTelegramMessages(many, (c) => `LINE:${c.structureId}`, {
      maxPerPlatform: 5,
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("📌 Digest");
    expect(msgs[0]).toContain("📊 PP 5/8 • UD 5/8");
    expect(msgs[0]).toContain("PP");
    expect(msgs[0]).toContain("UD");
    expect(msgs[0].split("LINE:").length - 1).toBe(10);
  });

  it("sortCardsForTelegramDigest breaks ties by higher cardEv", () => {
    const leg = pick();
    const lo = card({
      flexType: "2P",
      site: "prizepicks",
      legs: [
        { pick: { ...leg, id: "l1" }, side: "over" },
        { pick: { ...leg, id: "l2", player: "B" }, side: "over" },
      ],
      cardEv: 0.09,
      winProbCash: 0.2,
      avgEdgePct: 0.05,
    });
    const hi = { ...lo, cardEv: 0.11 };
    const sorted = sortCardsForTelegramDigest([lo, hi]);
    expect(sorted[0].cardEv).toBe(0.11);
    expect(sorted[1].cardEv).toBe(0.09);
  });

  it("keeps digest compact and one-line-per-card", () => {
    const c = card({
      flexType: "3P",
      site: "prizepicks",
      structureId: "3P",
      legs: [
        { pick: pick({ id: "c1", player: "Player One" }), side: "over" },
        { pick: pick({ id: "c2", player: "Player Two" }), side: "under" },
        { pick: pick({ id: "c3", player: "Player Three" }), side: "over" },
      ],
      cardEv: 0.101,
    });
    const noisyLine = () => "  [PP 3P]   •  A   •  B   •   C   (EV: +10.1%) ";
    const msg = renderSingleDigestMessage([c], noisyLine);
    const lines = msg.split("\n");
    expect(lines[0]).toContain("shown 1/1");
    expect(lines[1]).toContain("PP 1/1 • UD 0/0");
    expect(lines.some((l) => l.includes("1. [PP 3P] • A • B • C (EV: +10.1%) • PP • 3P • 3L • edge 5.0%"))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(7);
  });

  it("uses deterministic tie-breakers when rank and EV are equal", () => {
    const same = (idA: string, idB: string): CardEvResult =>
      card({
        flexType: "2P",
        site: "prizepicks",
        structureId: "2P",
        avgEdgePct: 0.05,
        winProbCash: 0.2,
        cardEv: 0.1,
        legs: [
          { pick: pick({ id: idA, player: `P-${idA}` }), side: "over" },
          { pick: pick({ id: idB, player: `P-${idB}` }), side: "over" },
        ],
      });
    const b = same("b1", "b2");
    const a = same("a1", "a2");
    const sorted = sortCardsForTelegramDigest([b, a]);
    expect(legSetKey(sorted[0])).toBe(legSetKey(a));
    expect(legSetKey(sorted[1])).toBe(legSetKey(b));
  });

  it("formats ISO run label to compact UTC minute shape", () => {
    const c = card({
      flexType: "2P",
      site: "prizepicks",
      structureId: "2P",
      legs: [
        { pick: pick({ id: "r1" }), side: "over" },
        { pick: pick({ id: "r2" }), side: "over" },
      ],
    });
    const msg = renderSingleDigestMessage([c], () => "LINE:2P", {
      runLabel: "2026-03-20T17:21:59Z",
    });
    expect(msg.split("\n")[0]).toContain("2026-03-20 17:21 UTC");
  });

  it("adds compact metadata suffix from existing optional fields only", () => {
    const c = card({
      flexType: "6F",
      structureId: "UD_6F_FLX",
      site: "underdog",
      avgEdgePct: 3.8,
      breakevenGap: 0.021,
      legs: [
        { pick: pick({ id: "m1", site: "underdog" }), side: "over" },
        { pick: pick({ id: "m2", site: "underdog" }), side: "over" },
        { pick: pick({ id: "m3", site: "underdog" }), side: "over" },
        { pick: pick({ id: "m4", site: "underdog" }), side: "over" },
        { pick: pick({ id: "m5", site: "underdog" }), side: "over" },
        { pick: pick({ id: "m6", site: "underdog" }), side: "over" },
      ],
    });
    const msg = renderSingleDigestMessage([c], () => "LINE:UD");
    const line = msg.split("\n").find((l) => l.startsWith("1. "));
    expect(line).toContain("LINE: UD • UD • UD_6F_FLX • 6L • edge 3.8% • BE +2.1pp");
  });

  it("omits missing optional metadata fields cleanly", () => {
    const c = card({
      flexType: "2P",
      site: "prizepicks",
      legs: [
        { pick: pick({ id: "o1" }), side: "over" },
        { pick: pick({ id: "o2" }), side: "under" },
      ],
      avgEdgePct: Number.NaN,
      breakevenGap: undefined,
      structureId: undefined,
    });
    const msg = renderSingleDigestMessage([c], () => "BASE");
    const line = msg.split("\n").find((l) => l.startsWith("1. "));
    expect(line).toBe("1. BASE • PP • 2P • 2L");
    expect(line?.includes("undefined")).toBe(false);
    expect(line?.includes("null")).toBe(false);
    expect(line?.endsWith("•")).toBe(false);
  });

  it("keeps metadata field order deterministic", () => {
    const c = card({
      flexType: "5F",
      structureId: "UD_5F_FLX",
      site: "underdog",
      avgEdgePct: 4.1,
      breakevenGap: -0.014,
      legs: [
        { pick: pick({ id: "d1", site: "underdog" }), side: "over" },
        { pick: pick({ id: "d2", site: "underdog" }), side: "over" },
        { pick: pick({ id: "d3", site: "underdog" }), side: "under" },
        { pick: pick({ id: "d4", site: "underdog" }), side: "over" },
        { pick: pick({ id: "d5", site: "underdog" }), side: "under" },
      ],
    });
    const msg = renderSingleDigestMessage([c], () => "BASE");
    const line = msg.split("\n").find((l) => l.startsWith("1. "));
    expect(line).toContain("BASE • UD • UD_5F_FLX • 5L • edge 4.1% • BE -1.4pp");
  });

  /**
   * Phase 17D: metadata token style lock (digest suffix only).
   * - Leg count: `<n>L` (e.g. 4L). Disallowed: `L<n>`, `n-leg`, etc.
   * - Edge: `edge x.x%` (lowercase `edge`, one decimal before `%`).
   * - Breakeven gap: `BE ±x.xpp` (uppercase `BE`, `pp` suffix; rounding unchanged in prod).
   */
  describe("Phase 17D: metadata token style lock", () => {
    it("enforces <n>L, edge x.x%, and BE ±x.xpp on a single card line", () => {
      const c = card({
        flexType: "4P",
        site: "prizepicks",
        structureId: "4P",
        avgEdgePct: 3.3,
        breakevenGap: 0.012,
        legs: [
          { pick: pick({ id: "mc-1" }), side: "over" },
          { pick: pick({ id: "mc-2" }), side: "over" },
          { pick: pick({ id: "mc-3" }), side: "under" },
          { pick: pick({ id: "mc-4" }), side: "over" },
        ],
      });
      const line = renderSingleDigestMessage([c], () => "MC")
        .split("\n")
        .find((l) => l.startsWith("1. "));
      expect(line).toBeDefined();
      // 1) Leg count: digits + L only (not L-prefix)
      expect(line).toMatch(/ • 4L • /);
      expect(line).not.toMatch(/ • L\d/);
      expect(line).not.toMatch(/\d+-leg\b/i);
      // 2) Edge: lowercase "edge", space, one decimal, %
      expect(line).toMatch(/edge 3\.3%/);
      expect(line).not.toMatch(/Edge \d/);
      expect(line).not.toMatch(/EDGE /);
      // 3) Breakeven gap: BE + signed + pp
      expect(line).toMatch(/ • BE \+1\.2pp$/);
      expect(line).not.toMatch(/ • be [+-]/);
      expect(line).not.toMatch(/ • Be [+-]/);
    });

    it("enforces BE ±x.xpp for negative breakeven gap", () => {
      const c = card({
        flexType: "5F",
        structureId: "UD_5F_FLX",
        site: "underdog",
        avgEdgePct: 4.1,
        breakevenGap: -0.014,
        legs: [
          { pick: pick({ id: "d1", site: "underdog" }), side: "over" },
          { pick: pick({ id: "d2", site: "underdog" }), side: "over" },
          { pick: pick({ id: "d3", site: "underdog" }), side: "under" },
          { pick: pick({ id: "d4", site: "underdog" }), side: "over" },
          { pick: pick({ id: "d5", site: "underdog" }), side: "under" },
        ],
      });
      const line = renderSingleDigestMessage([c], () => "BASE")
        .split("\n")
        .find((l) => l.startsWith("1. "));
      expect(line).toMatch(/ • 5L • edge 4\.1% • BE -1\.4pp$/);
      expect(line).not.toMatch(/ • be /);
    });
  });

  it("preserves numbering, section omission, and single-message behavior", () => {
    const ppOnly = [
      card({
        flexType: "2P",
        site: "prizepicks",
        structureId: "2P",
        legs: [
          { pick: pick({ id: "n1" }), side: "over" },
          { pick: pick({ id: "n2" }), side: "under" },
        ],
      }),
      card({
        flexType: "2P",
        site: "prizepicks",
        structureId: "2P",
        legs: [
          { pick: pick({ id: "n3" }), side: "over" },
          { pick: pick({ id: "n4" }), side: "under" },
        ],
        cardEv: 0.2,
      }),
    ];
    const msgs = buildHighEvTelegramMessages(ppOnly, () => "BASE", { maxPerPlatform: 5 });
    expect(msgs).toHaveLength(1);
    const lines = msgs[0].split("\n");
    expect(lines).toContain("PP");
    expect(lines).not.toContain("UD");
    const numbered = lines.filter((l) => /^\d+\.\s/.test(l));
    expect(numbered).toHaveLength(2);
    expect(numbered[0].startsWith("1. ")).toBe(true);
    expect(numbered[1].startsWith("2. ")).toBe(true);
  });

  it("normalizes whitespace with suffix and avoids duplicate separators", () => {
    const c = card({
      flexType: "3P",
      site: "prizepicks",
      structureId: "3P",
      avgEdgePct: 2.5,
      legs: [
        { pick: pick({ id: "w1" }), side: "over" },
        { pick: pick({ id: "w2" }), side: "over" },
        { pick: pick({ id: "w3" }), side: "under" },
      ],
    });
    const msg = renderSingleDigestMessage([c], () => "  A   |   B :  C  ");
    const line = msg.split("\n").find((l) => l.startsWith("1. "));
    expect(line).toContain("1. A| B: C • PP • 3P • 3L • edge 2.5%");
    expect(line?.includes("• •")).toBe(false);
    expect(line?.includes("  ")).toBe(false);
    expect(line?.endsWith("•")).toBe(false);
  });

  /**
   * Phase 17B governance (digest contract changes):
   * - Update golden contract string(s) in this file.
   * - Include explicit operator-facing rationale in the change/PR notes.
   * - Confirm Telegram message volume is unchanged (or explicitly call out if changed).
   * - Confirm ranking/card selection is unchanged.
   * - Confirm change is presentation-only unless explicitly stated otherwise.
   * - Validate with this spec + canonical verification (`npm run verify:canonical`).
   */
  // Operator-facing contract tests: treat golden strings below as user-visible digest UX contract.
  it("golden contract: mixed digest output shape is stable", () => {
    const pp = card({
      flexType: "3P",
      site: "prizepicks",
      structureId: "3P",
      cardEv: 0.131,
      avgEdgePct: 4.2,
      breakevenGap: 0.019,
      legs: [
        { pick: pick({ id: "g-pp-1a", player: "PP One" }), side: "over" },
        { pick: pick({ id: "g-pp-1b", player: "PP Two" }), side: "under" },
        { pick: pick({ id: "g-pp-1c", player: "PP Three" }), side: "over" },
      ],
    });
    const ud = card({
      flexType: "5F",
      site: "underdog",
      structureId: "UD_5F_FLX",
      cardEv: 0.121,
      avgEdgePct: Number.NaN,
      breakevenGap: undefined,
      legs: [
        { pick: pick({ id: "g-ud-1a", site: "underdog", player: "UD One" }), side: "over" },
        { pick: pick({ id: "g-ud-1b", site: "underdog", player: "UD Two" }), side: "over" },
        { pick: pick({ id: "g-ud-1c", site: "underdog", player: "UD Three" }), side: "under" },
        { pick: pick({ id: "g-ud-1d", site: "underdog", player: "UD Four" }), side: "over" },
        { pick: pick({ id: "g-ud-1e", site: "underdog", player: "UD Five" }), side: "under" },
      ],
    });
    const msg = renderSingleDigestMessage(
      [pp, ud],
      (c) => (c.site === "underdog" ? "  [UD]  LINE:UD_5F_FLX  " : " [PP]   LINE:3P "),
      { runLabel: "2026-03-20T17:21:59Z" }
    );
    const expected = [
      "📌 Digest • 2026-03-20 17:21 UTC • shown 2/2 • deduped 2",
      "📊 PP 1/1 • UD 1/1",
      "",
      "PP",
      "1. [PP] LINE: 3P • PP • 3P • 3L • edge 4.2% • BE +1.9pp",
      "",
      "UD",
      "1. [UD] LINE: UD_5F_FLX • UD • UD_5F_FLX • 5L",
    ].join("\n");
    expect(msg).toBe(expected);
  });

  it("golden contract: empty section omission stays stable", () => {
    const ppOnly = [
      card({
        flexType: "2P",
        site: "prizepicks",
        structureId: "2P",
        legs: [
          { pick: pick({ id: "g2-1" }), side: "over" },
          { pick: pick({ id: "g2-2" }), side: "under" },
        ],
      }),
    ];
    const msgs = buildHighEvTelegramMessages(ppOnly, () => "BASE", { maxPerPlatform: 5, runLabel: "fixed" });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBe(
      [
        "📌 Digest • fixed • shown 1/1 • deduped 1",
        "📊 PP 1/1 • UD 0/0",
        "",
        "PP",
        "1. BASE • PP • 2P • 2L • edge 5.0%",
      ].join("\n")
    );
  });
});
