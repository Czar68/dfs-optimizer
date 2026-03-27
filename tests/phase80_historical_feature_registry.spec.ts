/**
 * Phase 80 — Historical feature registry: schema, rolling windows, determinism, export shape.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import {
  extractHistoricalFeaturesFromRows,
  marketGroupKey,
  buildHistoricalFeatureRegistryPayload,
  writeHistoricalFeatureRegistryArtifacts,
} from "../src/modeling/historical_feature_extract";
import {
  HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION,
  type HistoricalFeatureRow,
} from "../src/modeling/historical_feature_registry";

function baseRow(overrides: Partial<PerfTrackerRow> & Pick<PerfTrackerRow, "leg_id" | "date">): PerfTrackerRow {
  return {
    player: "Test Player",
    stat: "PTS",
    line: 20.5,
    book: "test",
    trueProb: 0.52,
    projectedEV: 0.01,
    playedEV: 0.01,
    kelly: 0.01,
    card_tier: 1,
    ...overrides,
  };
}

describe("phase80 historical feature registry", () => {
  test("schema version and required keys on synthetic rows", () => {
    const rows: PerfTrackerRow[] = [
      baseRow({ leg_id: "a", date: "2024-01-01", result: 1 }),
      baseRow({ leg_id: "b", date: "2024-01-02", result: 0 }),
    ];
    const feats = extractHistoricalFeaturesFromRows(rows);
    expect(feats).toHaveLength(2);
    for (const f of feats) {
      expect(f.schemaVersion).toBe(HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION);
      expect(f.rowKey).toMatch(/^[^|]+\|2024-01-/);
      expect(f).toHaveProperty("formPriorSampleSize");
      expect(f).toHaveProperty("missingnessNotes");
      expect(f).toHaveProperty("provenance");
      expect(f.roleStabilityNote).toBe("schema_only_no_minutes_series_in_repo");
      expect(f.roleMinutesTrend).toBeNull();
    }
  });

  test("deterministic: same input rows produce identical output", () => {
    const rows: PerfTrackerRow[] = [
      baseRow({ leg_id: "x1", date: "2024-01-01", player: "A", stat: "PTS", line: 10, result: 1 }),
      baseRow({ leg_id: "x2", date: "2024-01-05", player: "A", stat: "PTS", line: 10, result: 0 }),
    ];
    const a = extractHistoricalFeaturesFromRows(rows);
    const b = extractHistoricalFeaturesFromRows([...rows]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("marketGroupKey stable for same player/stat/line without ids", () => {
    const r1 = baseRow({ leg_id: "m1", date: "2024-01-01" });
    const r2 = baseRow({ leg_id: "m2", date: "2024-01-02" });
    expect(marketGroupKey(r1)).toBe(marketGroupKey(r2));
  });

  test("rolling L5/L10: prior-only, no leakage; L5 mean matches last 5 hits", () => {
    const results: (0 | 1)[] = [1, 0, 1, 0, 1, 0, 1];
    const rows: PerfTrackerRow[] = results.map((result, i) =>
      baseRow({
        leg_id: `leg-${i}`,
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        result,
      })
    );
    const feats = extractHistoricalFeaturesFromRows(rows);
    const sixth = feats.find((f) => f.legId === "leg-5");
    expect(sixth).toBeDefined();
    // Prior 5 hits: indices 0..4 => 1,0,1,0,1 => mean 3/5
    expect(sixth!.formPriorSampleSize).toBe(5);
    expect(sixth!.formL5HitRate).toBeCloseTo(3 / 5, 6);
    expect(sixth!.formL10HitRate).toBeCloseTo(3 / 5, 6);
    const first = feats.find((f) => f.legId === "leg-0");
    expect(first!.formL5HitRate).toBeNull();
    expect(first!.missingnessNotes).toEqual(expect.arrayContaining(["formL5_insufficient_prior_games"]));
  });

  test("daysRest from prior resolved game (any market)", () => {
    const rows: PerfTrackerRow[] = [
      baseRow({
        leg_id: "p1",
        date: "2024-01-01",
        stat: "PTS",
        line: 10,
        result: 1,
      }),
      baseRow({
        leg_id: "p2",
        date: "2024-01-03",
        stat: "REB",
        line: 5,
        result: 1,
      }),
    ];
    const feats = extractHistoricalFeaturesFromRows(rows);
    const second = feats.find((f) => f.legId === "p2");
    expect(second!.daysRest).toBe(2);
    expect(second!.isBackToBack).toBe(false);
  });

  test("payload writes json, md, jsonl under temp cwd", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase80-"));
    const tracker = path.join(dir, "tracker.jsonl");
    const row = baseRow({ leg_id: "t1", date: "2024-02-01", result: 1 });
    fs.writeFileSync(tracker, JSON.stringify(row) + "\n", "utf8");

    const payload = buildHistoricalFeatureRegistryPayload({
      cwd: dir,
      trackerPath: tracker,
      jsonlRelativePath: "artifacts/historical_feature_rows.jsonl",
    });
    expect(payload.rowCount).toBe(1);
    expect(payload.schemaVersion).toBe(HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION);
    writeHistoricalFeatureRegistryArtifacts(dir, payload);

    const jsonPath = path.join(dir, "data", "reports", "latest_historical_feature_registry.json");
    const mdPath = path.join(dir, "data", "reports", "latest_historical_feature_registry.md");
    const jsonlPath = path.join(dir, "artifacts", "historical_feature_rows.jsonl");
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(fs.existsSync(jsonlPath)).toBe(true);
    const line = fs.readFileSync(jsonlPath, "utf8").trim();
    const parsed = JSON.parse(line) as HistoricalFeatureRow;
    expect(parsed.legId).toBe("t1");
  });
});
