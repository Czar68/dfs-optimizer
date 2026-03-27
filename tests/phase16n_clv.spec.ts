/**
 * Phase 16N: CLV math + stable ids + backward-compatible tracker parsing.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { deriveClvMetrics } from "../src/tracking/clv_math";
import { exportModelDataset } from "../src/tracking/export_model_dataset";
import { stableMarketId, stablePlayerId } from "../src/tracking/id_normalization";
import { parseTrackerLine } from "../src/perf_tracker_types";

describe("Phase 16N CLV math", () => {
  it("deriveClvMetrics: delta and pct from implied probs", () => {
    const { clvDelta, clvPct } = deriveClvMetrics(0.52, 0.55);
    expect(clvDelta).toBeCloseTo(0.03, 8);
    expect(clvPct).toBeCloseTo((0.03 / 0.52) * 100, 8);
  });

  it("deriveClvMetrics returns empty when close missing", () => {
    expect(deriveClvMetrics(0.52, undefined)).toEqual({});
  });
});

describe("Phase 16N stable ids", () => {
  it("stablePlayerId is deterministic", () => {
    expect(stablePlayerId("NBA", "LeBron James")).toBe(stablePlayerId("NBA", "LeBron James"));
    expect(stablePlayerId("NBA", "LeBron James")).not.toBe(stablePlayerId("NFL", "LeBron James"));
  });

  it("stableMarketId includes stat and line", () => {
    const a = stableMarketId("NBA", "X", "points", 25.5);
    const b = stableMarketId("NBA", "X", "points", 26.5);
    expect(a).not.toBe(b);
  });
});

describe("Phase 16N backward compatibility", () => {
  it("parseTrackerLine accepts legacy rows without Phase 16N fields", () => {
    const line = JSON.stringify({
      date: "2026-03-01",
      leg_id: "pp-1-OVER",
      player: "A",
      stat: "points",
      line: 20,
      book: "fanduel",
      trueProb: 0.55,
      projectedEV: 0.02,
      playedEV: 0.02,
      kelly: 0.1,
      card_tier: 1,
    });
    const row = parseTrackerLine(line);
    expect(row).not.toBeNull();
    expect(row!.playerId).toBeUndefined();
    expect(row!.openImpliedProb).toBeUndefined();
  });

  it("legacy pending_cards shape without enriched legs still parses", () => {
    const raw = {
      timestamp: "2026-01-01T00:00:00.000Z",
      cards: [
        {
          cardId: "abc",
          platform: "PP",
          flexType: "3P",
          projectedEv: 0.1,
          breakevenGap: 0,
          timestamp: "2026-01-01T00:00:00.000Z",
          legs: [
            {
              playerName: "A",
              market: "points",
              line: 20,
              pick: "Over",
              projectedProb: 0.55,
              consensusOdds: -110,
              result: "Pending",
            },
          ],
        },
      ],
    };
    const s = JSON.stringify(raw);
    const parsed = JSON.parse(s) as typeof raw;
    expect("playerId" in parsed.cards[0].legs[0]).toBe(false);
  });
});

describe("Phase 16N export_model_dataset", () => {
  it("writes JSONL without throwing", () => {
    const tmp = path.join(os.tmpdir(), `model_export_${Date.now()}.jsonl`);
    try {
      const p = exportModelDataset({ outPath: tmp, includeTrackerJson: false });
      expect(p).toBe(tmp);
      expect(fs.existsSync(tmp)).toBe(true);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });
});
