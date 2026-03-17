/**
 * tests/telegram_consolidated.spec.ts
 * Unit tests for consolidated Telegram message: top 5 by tier then compositeScore,
 * MarkdownV2 escaping, isMock prefix, length cap.
 */

import {
  buildConsolidatedMessage,
  type TelegramPlay,
  type ConsolidatedMeta,
} from "../src/utils/telegram";

describe("Telegram consolidated message", () => {
  const baseMeta: ConsolidatedMeta = {
    runTs: "2026-03-14T06:00:00",
    bankroll: 700,
    totalCards: 42,
    matchRates: { PP: "84.5%", UD: "50.8%" },
    isMock: false,
  };

  it("includes exactly 5 plays when given 8 (mixed PP/UD, tier 1 and 2)", () => {
    const plays: TelegramPlay[] = [
      { site: "PP", tier: 1, compositeScore: 0.09, player: "LeBron James", statLine: "PTS o22.5", pick: "over", cardEv: 0.085, kellyStake: 28, oddsType: "standard" },
      { site: "UD", tier: 1, compositeScore: 0.088, player: "Steph Curry", statLine: "3PM o4.5", pick: "over", cardEv: 0.082, kellyStake: 22, oddsType: "demon" },
      { site: "PP", tier: 1, compositeScore: 0.082, player: "Jokic", statLine: "AST o8.5", pick: "over", cardEv: 0.078, kellyStake: 20 },
      { site: "UD", tier: 2, compositeScore: 0.075, player: "Luka", statLine: "PTS o28.5", pick: "over", cardEv: 0.072, kellyStake: 18, oddsType: "goblin" },
      { site: "PP", tier: 2, compositeScore: 0.07, player: "Giannis", statLine: "REB o12.5", pick: "over", cardEv: 0.068, kellyStake: 15 },
      { site: "UD", tier: 2, compositeScore: 0.065, player: "Tatum", statLine: "PTS o26.5", pick: "over", cardEv: 0.062, kellyStake: 14 },
      { site: "PP", tier: 2, compositeScore: 0.06, player: "Embiid", statLine: "PTS o24.5", pick: "under", cardEv: 0.058, kellyStake: 12 },
      { site: "UD", tier: 2, compositeScore: 0.055, player: "Booker", statLine: "AST o5.5", pick: "over", cardEv: 0.052, kellyStake: 10 },
    ];
    const out = buildConsolidatedMessage(plays, baseMeta);
    const playHeaders = out.match(/\*\d+\\. \\\[/g);
    expect(playHeaders).toHaveLength(5);
  });

  it("sorts Tier 1 before Tier 2, then by compositeScore desc", () => {
    const plays: TelegramPlay[] = [
      { site: "UD", tier: 2, compositeScore: 0.09, player: "A", statLine: "PTS o20", pick: "over", cardEv: 0.09, kellyStake: 25 },
      { site: "PP", tier: 1, compositeScore: 0.08, player: "B", statLine: "PTS o22", pick: "over", cardEv: 0.08, kellyStake: 20 },
      { site: "PP", tier: 1, compositeScore: 0.085, player: "C", statLine: "PTS o24", pick: "over", cardEv: 0.085, kellyStake: 22 },
    ];
    const out = buildConsolidatedMessage(plays, baseMeta);
    const firstPlay = out.match(/\*1\\. \\\[(PP|UD)\\]/);
    const secondPlay = out.match(/\*2\\. \\\[(PP|UD)\\]/);
    expect(firstPlay?.[1]).toBe("PP");
    expect(secondPlay?.[1]).toBe("PP");
    const blocks = out.split(/\*\d+\\. \\\[/);
    const block1 = blocks[1] ?? "";
    const block2 = blocks[2] ?? "";
    expect(block1).toContain("C");
    expect(block2).toContain("B");
  });

  it("output length is at most 4000 chars", () => {
    const plays: TelegramPlay[] = Array.from({ length: 20 }, (_, i) => ({
      site: i % 2 === 0 ? "PP" : "UD",
      tier: (i % 2) + 1 as 1 | 2,
      compositeScore: 0.09 - i * 0.002,
      player: `Player${i}`,
      statLine: "PTS o22.5",
      pick: "over",
      cardEv: 0.08,
      kellyStake: 20,
    }));
    const out = buildConsolidatedMessage(plays, baseMeta);
    expect(out.length).toBeLessThanOrEqual(4000);
  });

  it("isMock true produces MOCK RUN in the message", () => {
    const plays: TelegramPlay[] = [
      { site: "PP", tier: 1, compositeScore: 0.08, player: "X", statLine: "PTS o20", pick: "over", cardEv: 0.08, kellyStake: 20 },
    ];
    const out = buildConsolidatedMessage(plays, { ...baseMeta, isMock: true });
    expect(out).toContain("MOCK RUN");
  });

  it("escapes MarkdownV2 special chars in player names", () => {
    const plays: TelegramPlay[] = [
      { site: "PP", tier: 1, compositeScore: 0.08, player: "O'Brien (Jr.)", statLine: "PTS o22.5", pick: "over", cardEv: 0.08, kellyStake: 20 },
    ];
    const out = buildConsolidatedMessage(plays, baseMeta);
    expect(out).toContain("\\(");
    expect(out).toContain("\\)");
    expect(out).not.toMatch(/\*O'Brien/);
  });
});
