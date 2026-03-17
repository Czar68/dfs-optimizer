/**
 * Unit tests for CardBuilder service (MergedProp → EvPick, gameTime, CSV headers).
 * No additional mocking in src/mocks/handlers.ts is required: buildCardsFromMergedProps
 * uses evaluateFlexCard → getStructureEV; when ENGINE_MODE !== 'sheets', the engine
 * uses computeLocalStructureEVs (no HTTP). For full card-build tests, leave ENGINE_MODE
 * unset or mock evaluateFlexCard in the test if you need to isolate from the EV engine.
 */

import * as fs from "fs";
import * as path from "path";
import {
  getGameTimeFromMergedProp,
  mergedPropToEvPick,
  mergedPropsToEvPicks,
  writeLegsCsv,
  writeCardsCsv,
  LEGS_CSV_HEADERS,
  CARDS_CSV_HEADERS,
} from "../src/services/cardBuilder";
import type { MergedProp } from "../src/types/unified-prop";
import type { CardEvResult } from "../src/types";

function fixtureMergedProp(overrides: Partial<MergedProp> = {}): MergedProp {
  return {
    id: "pp-leg-1",
    provider: "PP",
    player: "LeBron James",
    statType: "points",
    lineValue: 24.5,
    breakeven: 0.524,
    odds: { over: -110, under: -110 },
    edge: 0.03,
    trueProb: 0.55,
    raw: {},
    ...overrides,
  };
}

describe("CardBuilder", () => {
  describe("getGameTimeFromMergedProp", () => {
    it("returns gameTime when set on prop", () => {
      const m = fixtureMergedProp({ gameTime: "2026-03-12T02:00:00Z" });
      expect(getGameTimeFromMergedProp(m)).toBe("2026-03-12T02:00:00Z");
    });

    it("falls back to raw.commenceTime", () => {
      const m = fixtureMergedProp({ raw: { commenceTime: "2026-03-12T03:00:00Z" } });
      expect(getGameTimeFromMergedProp(m)).toBe("2026-03-12T03:00:00Z");
    });

    it("falls back to raw.startTime", () => {
      const m = fixtureMergedProp({ raw: { startTime: "2026-03-12T04:00:00" } });
      expect(getGameTimeFromMergedProp(m)).toBe("2026-03-12T04:00:00");
    });

    it("returns empty string when missing", () => {
      expect(getGameTimeFromMergedProp(fixtureMergedProp())).toBe("");
    });
  });

  describe("mergedPropToEvPick / mergedPropsToEvPicks", () => {
    it("maps MergedProp to EvPick with correct fields", () => {
      const m = fixtureMergedProp({ gameTime: "2026-03-12T02:00:00Z" });
      const pick = mergedPropToEvPick(m, "NBA");
      expect(pick.id).toBe("pp-leg-1");
      expect(pick.player).toBe("LeBron James");
      expect(pick.stat).toBe("points");
      expect(pick.line).toBe(24.5);
      expect(pick.trueProb).toBe(0.55);
      expect(pick.edge).toBe(0.03);
      expect(pick.overOdds).toBe(-110);
      expect(pick.underOdds).toBe(-110);
      expect(pick.startTime).toBe("2026-03-12T02:00:00Z");
      expect(pick.site).toBe("prizepicks");
      expect(pick.sport).toBe("NBA");
    });

    it("maps provider UD to site underdog", () => {
      const m = fixtureMergedProp({ provider: "UD" });
      const pick = mergedPropToEvPick(m);
      expect(pick.site).toBe("underdog");
    });

    it("mergedPropsToEvPicks returns one EvPick per MergedProp", () => {
      const merged = [fixtureMergedProp({ id: "a" }), fixtureMergedProp({ id: "b" })];
      const picks = mergedPropsToEvPicks(merged, "NBA");
      expect(picks).toHaveLength(2);
      expect(picks[0].id).toBe("a");
      expect(picks[1].id).toBe("b");
    });
  });

  describe("CSV headers", () => {
    it("LEGS_CSV_HEADERS matches sheets_push_cards.py expected columns", () => {
      expect(LEGS_CSV_HEADERS).toContain("id");
      expect(LEGS_CSV_HEADERS).toContain("player");
      expect(LEGS_CSV_HEADERS).toContain("stat");
      expect(LEGS_CSV_HEADERS).toContain("line");
      expect(LEGS_CSV_HEADERS).toContain("trueProb");
      expect(LEGS_CSV_HEADERS).toContain("edge");
      expect(LEGS_CSV_HEADERS).toContain("legEv");
      expect(LEGS_CSV_HEADERS).toContain("gameTime");
      expect(LEGS_CSV_HEADERS).toContain("runTimestamp");
    });

    it("CARDS_CSV_HEADERS matches sheets_push_cards.py expected columns", () => {
      expect(CARDS_CSV_HEADERS).toContain("site");
      expect(CARDS_CSV_HEADERS).toContain("flexType");
      expect(CARDS_CSV_HEADERS).toContain("Site-Leg");
      expect(CARDS_CSV_HEADERS).toContain("Player-Prop-Line");
      expect(CARDS_CSV_HEADERS).toContain("cardEv");
      expect(CARDS_CSV_HEADERS).toContain("avgEdgePct");
      expect(CARDS_CSV_HEADERS).toContain("avgProb");
      expect(CARDS_CSV_HEADERS).toContain("kellyStake");
      expect(CARDS_CSV_HEADERS).toContain("runTimestamp");
      expect(CARDS_CSV_HEADERS.filter((h) => h.startsWith("leg") && h.endsWith("Id"))).toHaveLength(6);
    });
  });

  describe("writeLegsCsv", () => {
    it("writes legs CSV with correct headers and one row per leg", () => {
      const tmpDir = path.join(process.cwd(), "artifacts", "test_card_builder");
      fs.mkdirSync(tmpDir, { recursive: true });
      const outPath = path.join(tmpDir, "legs.csv");
      const picks = mergedPropsToEvPicks([fixtureMergedProp({ id: "L1" }), fixtureMergedProp({ id: "L2" })]);
      writeLegsCsv(picks, outPath, "2026-03-12T12:00:00Z");
      const content = fs.readFileSync(outPath, "utf8");
      const lines = content.split("\n");
      expect(lines[0]).toBe(LEGS_CSV_HEADERS.join(","));
      expect(lines).toHaveLength(3); // header + 2 rows
      expect(content).toContain("L1");
      expect(content).toContain("L2");
      fs.rmSync(outPath, { force: true });
    });
  });

  describe("writeCardsCsv", () => {
    it("writes cards CSV with correct headers", () => {
      const tmpDir = path.join(process.cwd(), "artifacts", "test_card_builder");
      fs.mkdirSync(tmpDir, { recursive: true });
      const outPath = path.join(tmpDir, "cards.csv");
      const emptyCards: CardEvResult[] = [];
      writeCardsCsv(emptyCards, outPath, "2026-03-12T12:00:00Z");
      const content = fs.readFileSync(outPath, "utf8");
      expect(content.trim()).toBe(CARDS_CSV_HEADERS.join(","));
      fs.rmSync(outPath, { force: true });
    });
  });
});
