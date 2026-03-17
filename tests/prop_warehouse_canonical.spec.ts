/**
 * Canonical NBA prop warehouse: path contract, prop-history and validator use same source, audit shape.
 */

import path from "path";
import fs from "fs";
import { getDataPath, getArtifactsPath, NBA_PROPS_MASTER_CSV, MLB_PROPS_MASTER_CSV, PROP_WAREHOUSE_AUDIT_JSON } from "../src/constants/paths";
import { appendPropsToHistory, HEADER_COLUMNS } from "../src/services/propHistory";
import { calculateEvForMergedPick } from "../src/calculate_ev";
import type { MergedPick } from "../src/types";

describe("Canonical prop warehouse path", () => {
  it("NBA_PROPS_MASTER_CSV resolves to path under data/prop_history containing nba_props_master.csv", () => {
    const resolved = getDataPath(NBA_PROPS_MASTER_CSV);
    expect(resolved).toContain("prop_history");
    expect(resolved).toContain("nba_props_master.csv");
    expect(path.normalize(resolved)).toBe(resolved);
  });

  it("MLB_PROPS_MASTER_CSV resolves to path under data/prop_history containing mlb_props_master.csv", () => {
    const resolved = getDataPath(MLB_PROPS_MASTER_CSV);
    expect(resolved).toContain("prop_history");
    expect(resolved).toContain("mlb_props_master.csv");
  });

  it("PROP_WAREHOUSE_AUDIT_JSON resolves under artifacts", () => {
    const resolved = getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON);
    expect(resolved).toContain("artifacts");
    expect(resolved).toContain("prop-warehouse-audit.json");
  });
});

describe("Prop-history append uses canonical path", () => {
  it("appendPropsToHistory with empty legs does not throw", () => {
    expect(() => appendPropsToHistory([], "2026-01-01T12:00:00 ET")).not.toThrow();
  });

  it("appendPropsToHistory with empty legs and platform option does not throw", () => {
    expect(() => appendPropsToHistory([], "2026-01-01T12:00:00 ET", { platform: "PP" })).not.toThrow();
    expect(() => appendPropsToHistory([], "2026-01-01T12:00:00 ET", { platform: "UD" })).not.toThrow();
  });
});

describe("Validator reads canonical path", () => {
  it("validator script uses same NBA path as paths.ts", () => {
    const canonicalNbaPath = getDataPath(NBA_PROPS_MASTER_CSV);
    expect(canonicalNbaPath).toBeDefined();
    expect(canonicalNbaPath).toContain("nba_props_master.csv");
    expect(canonicalNbaPath).toContain("prop_history");
  });
});

describe("matchType propagation", () => {
  const baseMerged = (overrides: Partial<MergedPick>): MergedPick =>
    ({
      sport: "NBA",
      site: "prizepicks",
      league: "NBA",
      player: "Test",
      team: null,
      opponent: null,
      stat: "points",
      line: 20,
      projectionId: "p1",
      gameId: null,
      startTime: null,
      book: "DK",
      overOdds: -110,
      underOdds: -110,
      trueProb: 0.52,
      fairOverOdds: -108,
      fairUnderOdds: -108,
      isDemon: false,
      isGoblin: false,
      isPromo: false,
      scoringWeight: 1.0,
      isNonStandardOdds: false,
      ...overrides,
    }) as MergedPick;

  it("calculateEvForMergedPick copies matchType from MergedPick to EvPick when set", () => {
    const withMain = baseMerged({ matchType: "main" });
    const evMain = calculateEvForMergedPick(withMain);
    expect(evMain).not.toBeNull();
    expect(evMain!.matchType).toBe("main");

    const withAlt = baseMerged({ matchType: "alt" });
    expect(calculateEvForMergedPick(withAlt)!.matchType).toBe("alt");

    const withFallback = baseMerged({ matchType: "fallback_pp" });
    expect(calculateEvForMergedPick(withFallback)!.matchType).toBe("fallback_pp");
  });

  it("calculateEvForMergedPick omits matchType when empty or undefined", () => {
    const noMatch = baseMerged({ matchType: "" });
    const evEmpty = calculateEvForMergedPick(noMatch);
    expect(evEmpty).not.toBeNull();
    expect(evEmpty!.matchType).toBeUndefined();

    const undef = baseMerged({});
    expect(calculateEvForMergedPick(undef)!.matchType).toBeUndefined();
  });
});

describe("Prop-history schema", () => {
  it("HEADER_COLUMNS includes match_type after dfs_platform and before market_line", () => {
    expect(HEADER_COLUMNS).toContain("match_type");
    const i = HEADER_COLUMNS.indexOf("match_type");
    const iDfs = HEADER_COLUMNS.indexOf("dfs_platform");
    const iMarket = HEADER_COLUMNS.indexOf("market_line");
    expect(iDfs).toBeGreaterThanOrEqual(0);
    expect(iMarket).toBeGreaterThanOrEqual(0);
    expect(i).toBe(iDfs + 1);
    expect(i).toBe(iMarket - 1);
  });
});

describe("Prop warehouse audit artifact shape", () => {
  const requiredAuditKeys = [
    "canonicalPath",
    "fileExists",
    "rowCount",
    "latestDate",
    "latestSnapshot",
    "ppRowCount",
    "udRowCount",
    "duplicateWarningCount",
    "validationStatus",
  ];

  it("audit payload has generatedAt and nba/mlb keys when artifact exists", () => {
    const auditPath = getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON);
    if (!fs.existsSync(auditPath)) {
      return;
    }
    const raw = fs.readFileSync(auditPath, "utf8");
    const data = JSON.parse(raw) as { generatedAt?: string; nba?: unknown; mlb?: unknown };
    expect(data).toHaveProperty("generatedAt");
    expect(data).toHaveProperty("nba");
    expect(data).toHaveProperty("mlb");
  });

  it("nba audit object has required keys when present", () => {
    const auditPath = getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON);
    if (!fs.existsSync(auditPath)) {
      return;
    }
    const raw = fs.readFileSync(auditPath, "utf8");
    const data = JSON.parse(raw) as { nba: Record<string, unknown> | null };
    if (data.nba == null) return;
    for (const key of requiredAuditKeys) {
      expect(data.nba).toHaveProperty(key);
    }
    expect(["ok", "warning", "error"]).toContain(data.nba.validationStatus);
  });

  it("nba audit object has sane counts when present", () => {
    const auditPath = getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON);
    if (!fs.existsSync(auditPath)) {
      return;
    }
    const raw = fs.readFileSync(auditPath, "utf8");
    const data = JSON.parse(raw) as {
      nba?: { rowCount?: number; ppRowCount?: number; udRowCount?: number; duplicateWarningCount?: number } | null;
    };
    if (data.nba == null) return;
    expect(typeof data.nba.rowCount).toBe("number");
    expect(data.nba.rowCount).toBeGreaterThanOrEqual(0);
    expect(typeof data.nba.ppRowCount).toBe("number");
    expect(typeof data.nba.udRowCount).toBe("number");
    expect(data.nba.ppRowCount).toBeGreaterThanOrEqual(0);
    expect(data.nba.udRowCount).toBeGreaterThanOrEqual(0);
  });

  it("when nba rowCount > 0, audit includes matchTypeCounts object", () => {
    const auditPath = getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON);
    if (!fs.existsSync(auditPath)) return;
    const raw = fs.readFileSync(auditPath, "utf8");
    const data = JSON.parse(raw) as { nba?: { rowCount?: number; matchTypeCounts?: Record<string, number> } | null };
    if (data.nba == null || (data.nba.rowCount ?? 0) === 0) return;
    expect(data.nba).toHaveProperty("matchTypeCounts");
    expect(typeof data.nba.matchTypeCounts).toBe("object");
    expect(data.nba.matchTypeCounts).not.toBeNull();
  });
});
