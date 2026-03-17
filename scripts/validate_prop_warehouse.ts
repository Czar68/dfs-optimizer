import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, getArtifactsPath, NBA_PROPS_MASTER_CSV, MLB_PROPS_MASTER_CSV, PROP_WAREHOUSE_AUDIT_JSON } from "../src/constants/paths";

type WarehouseRow = {
  date?: string;
  snapshot_time?: string;
  player?: string;
  prop_type?: string;
  stat?: string;
  line?: string;
  match_type?: string;
  dfs_platform?: string;
  [key: string]: any;
};

type LineDriftFlag = {
  date: string;
  snapshot_time: string;
  player: string;
  prop_type: string;
  lines: number[];
};

type StatAnomaly = {
  date: string;
  snapshot_time: string;
  player: string;
  prop_type: string;
  line: number;
  threshold: number;
};

type NameVariant = {
  canonical: string;
  variants: string[];
};

type ValidationReport = {
  duplicate_count: number;
  line_drift_flags: LineDriftFlag[];
  stat_anomalies: StatAnomaly[];
  name_variants: NameVariant[];
};

const REPORT_DIR = getDataPath("validation");

/** Known merge match types from merge_odds; blank = missing or empty. */
export type MatchTypeLabel = "main" | "alt" | "alt_ud" | "alt_juice_rescue" | "fallback_pp" | "fallback_ud" | "blank";

export type PropWarehouseAudit = {
  canonicalPath: string;
  fileExists: boolean;
  rowCount: number;
  latestDate: string | null;
  latestSnapshot: string | null;
  ppRowCount: number;
  udRowCount: number;
  duplicateWarningCount: number;
  validationStatus: "ok" | "warning" | "error";
  /** Counts by match type (main, alt, fallback_pp, fallback_ud, blank, etc.). Omitted when rowCount=0. */
  matchTypeCounts?: Record<string, number>;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function canonicalizePlayerName(raw: string): string {
  const base = stripAccents(normalizeName(raw))
    .replace(/['.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+jr\.?$/i, "")
    .replace(/\s+sr\.?$/i, "")
    .replace(/\s+iii$/i, "")
    .replace(/\s+ii$/i, "")
    .replace(/\s+iv$/i, "")
    .trim();
  return base;
}

function normalizePropType(row: WarehouseRow): string {
  const raw = row.prop_type ?? row.stat ?? "";
  return normalizeName(raw);
}

function parseLine(row: WarehouseRow): number | null {
  const raw = row.line ?? "";
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function getStatThreshold(propType: string): number | null {
  switch (propType) {
    case "points":
      return 45;
    case "rebounds":
      return 20;
    case "assists":
      return 18;
    case "steals":
      return 6;
    case "blocks":
      return 6;
    default:
      return null;
  }
}

async function readWarehouse(pathToFile: string): Promise<WarehouseRow[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(pathToFile)) {
      console.warn(`[PROP_WAREHOUSE] File not found at ${pathToFile}. Skipping validation.`);
      resolve([]);
      return;
    }

    const rows: WarehouseRow[] = [];
    fs.createReadStream(pathToFile)
      .pipe(csv())
      .on("data", (data: any) => {
        rows.push(data as WarehouseRow);
      })
      .on("end", () => {
        resolve(rows);
      })
      .on("error", (err: Error) => {
        reject(err);
      });
  });
}

function validateDuplicates(rows: WarehouseRow[]): number {
  const counts = new Map<string, number>();

  for (const r of rows) {
    const key = [
      r.date ?? "",
      r.snapshot_time ?? "",
      normalizeName(r.player ?? ""),
      normalizePropType(r),
      r.line ?? "",
    ].join("|");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let duplicateCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > 1) {
      duplicateCount += count - 1;
    }
  }

  if (duplicateCount > 0) {
    console.warn(
      `[PROP_WAREHOUSE] Duplicate props detected: ${duplicateCount} duplicate rows (by date,snapshot_time,player,prop_type,line).`
    );
  }

  return duplicateCount;
}

function validateLineDrift(rows: WarehouseRow[]): LineDriftFlag[] {
  const bySnapshotPlayerStat = new Map<string, Set<number>>();

  for (const r of rows) {
    const date = r.date ?? "";
    const snap = r.snapshot_time ?? "";
    const player = normalizeName(r.player ?? "");
    const propType = normalizePropType(r);
    const line = parseLine(r);
    if (!date || !snap || !player || !propType || line == null) continue;

    const key = [date, snap, player, propType].join("|");
    if (!bySnapshotPlayerStat.has(key)) {
      bySnapshotPlayerStat.set(key, new Set<number>());
    }
    bySnapshotPlayerStat.get(key)!.add(line);
  }

  const flags: LineDriftFlag[] = [];
  for (const [key, lineSet] of bySnapshotPlayerStat.entries()) {
    if (lineSet.size <= 1) continue;
    const [date, snap, player, propType] = key.split("|");
    const lines = Array.from(lineSet.values()).sort((a, b) => a - b);
    flags.push({ date, snapshot_time: snap, player, prop_type: propType, lines });
  }

  if (flags.length > 0) {
    console.warn(
      `[PROP_WAREHOUSE] Line drift anomalies: ${flags.length} player+stat combos have conflicting lines within the same snapshot.`
    );
  }

  return flags;
}

function validateImpossibleStats(rows: WarehouseRow[]): StatAnomaly[] {
  const anomalies: StatAnomaly[] = [];

  for (const r of rows) {
    const date = r.date ?? "";
    const snap = r.snapshot_time ?? "";
    const player = r.player ?? "";
    const propType = normalizePropType(r);
    const line = parseLine(r);
    if (!date || !snap || !player || !propType || line == null) continue;

    const threshold = getStatThreshold(propType);
    if (threshold == null) continue;
    if (line > threshold) {
      anomalies.push({ date, snapshot_time: snap, player, prop_type: propType, line, threshold });
    }
  }

  if (anomalies.length > 0) {
    console.warn(
      `[PROP_WAREHOUSE] Stat anomalies: ${anomalies.length} props exceed NBA thresholds (points>45, rebounds>20, assists>18, steals>6, blocks>6).`
    );
  }

  return anomalies;
}

function validateNameVariants(rows: WarehouseRow[]): NameVariant[] {
  const byCanonical = new Map<string, Set<string>>();

  for (const r of rows) {
    const raw = r.player ?? "";
    if (!raw.trim()) continue;
    const canonical = canonicalizePlayerName(raw);
    if (!canonical) continue;
    if (!byCanonical.has(canonical)) {
      byCanonical.set(canonical, new Set<string>());
    }
    byCanonical.get(canonical)!.add(raw.trim());
  }

  const variants: NameVariant[] = [];
  for (const [canonical, set] of byCanonical.entries()) {
    const uniq = Array.from(set.values());
    if (uniq.length <= 1) continue;
    variants.push({ canonical, variants: uniq.sort() });
  }

  if (variants.length > 0) {
    console.warn(
      `[PROP_WAREHOUSE] Player name variants detected for ${variants.length} canonical names (possible new aliases).`
    );
  }

  return variants;
}

const KNOWN_MATCH_TYPES = ["main", "alt", "alt_ud", "alt_juice_rescue", "fallback_pp", "fallback_ud"] as const;

function computeMatchTypeCounts(rows: WarehouseRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of KNOWN_MATCH_TYPES) {
    counts[label] = 0;
  }
  counts.blank = 0;

  for (const r of rows) {
    const raw = String(r.match_type ?? "").trim();
    if (raw && KNOWN_MATCH_TYPES.includes(raw as (typeof KNOWN_MATCH_TYPES)[number])) {
      counts[raw]++;
    } else {
      counts.blank++;
    }
  }
  return counts;
}

function computeAudit(
  canonicalPath: string,
  rows: WarehouseRow[],
  duplicateCount: number,
  lineDriftCount: number,
  statAnomalyCount: number
): PropWarehouseAudit {
  let latestDate: string | null = null;
  let latestSnapshot: string | null = null;
  let ppRowCount = 0;
  let udRowCount = 0;

  for (const r of rows) {
    const platform = String(r.dfs_platform ?? "").toLowerCase();
    if (platform.includes("prizepick")) ppRowCount++;
    else if (platform.includes("underdog")) udRowCount++;

    const d = r.date ?? "";
    const snap = r.snapshot_time ?? "";
    if (d && (latestDate == null || d > latestDate)) latestDate = d;
  }
  if (latestDate) {
    const withDate = rows.filter((r) => (r.date ?? "") === latestDate);
    const snaps = withDate.map((r) => r.snapshot_time ?? "").filter(Boolean);
    latestSnapshot = snaps.length > 0 ? snaps.sort().reverse()[0] ?? null : null;
  }

  const hasWarnings = duplicateCount > 0 || lineDriftCount > 0 || statAnomalyCount > 0;
  const validationStatus: "ok" | "warning" | "error" = hasWarnings ? "warning" : "ok";

  const matchTypeCounts = rows.length > 0 ? computeMatchTypeCounts(rows) : undefined;

  return {
    canonicalPath,
    fileExists: fs.existsSync(canonicalPath),
    rowCount: rows.length,
    latestDate,
    latestSnapshot,
    ppRowCount,
    udRowCount,
    duplicateWarningCount: duplicateCount,
    validationStatus,
    matchTypeCounts,
  };
}

async function main(): Promise<void> {
  console.log("[PROP_WAREHOUSE] Validation starting...");
  const datasets: { label: string; path: string; report: string }[] = [
    {
      label: "NBA",
      path: getDataPath(NBA_PROPS_MASTER_CSV),
      report: path.join(REPORT_DIR, "nba_prop_history_report.json"),
    },
    {
      label: "MLB",
      path: getDataPath(MLB_PROPS_MASTER_CSV),
      report: path.join(REPORT_DIR, "mlb_prop_history_report.json"),
    },
  ];

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const auditByLabel: Record<string, PropWarehouseAudit> = {};

  for (const ds of datasets) {
    console.log(`[PROP_WAREHOUSE] Validating ${ds.label} warehouse at ${ds.path}`);
    const rows = await readWarehouse(ds.path);
    if (rows.length === 0) {
      console.log(`[PROP_WAREHOUSE] ${ds.label} warehouse is empty or missing; skipping.`);
      auditByLabel[ds.label] = computeAudit(ds.path, [], 0, 0, 0);
      continue;
    }

    console.log(`[PROP_WAREHOUSE] ${ds.label} warehouse rows: ${rows.length}`);

    const duplicateCount = validateDuplicates(rows);
    const lineDriftFlags = validateLineDrift(rows);
    const statAnomalies = validateImpossibleStats(rows);
    const nameVariants = validateNameVariants(rows);

    const report: ValidationReport = {
      duplicate_count: duplicateCount,
      line_drift_flags: lineDriftFlags,
      stat_anomalies: statAnomalies,
      name_variants: nameVariants,
    };

    fs.writeFileSync(ds.report, JSON.stringify(report, null, 2), "utf8");
    console.log(`[PROP_WAREHOUSE] ${ds.label} validation report written to ${ds.report}`);

    const audit = computeAudit(ds.path, rows, duplicateCount, lineDriftFlags.length, statAnomalies.length);
    auditByLabel[ds.label] = audit;

    const status = audit.validationStatus;
    const latestDate = audit.latestDate ?? "";
    const latestSnapshot = audit.latestSnapshot ?? "";
    const mt = audit.matchTypeCounts ?? {};
    const matchTypesLog =
      Object.keys(mt).length > 0
        ? ` matchTypes main=${mt.main ?? 0} alt=${(mt.alt ?? 0) + (mt.alt_ud ?? 0) + (mt.alt_juice_rescue ?? 0)} fallback_pp=${mt.fallback_pp ?? 0} fallback_ud=${mt.fallback_ud ?? 0} blank=${mt.blank ?? 0}`
        : "";
    console.log(
      `PROPWAREHOUSE status=${status} rows=${audit.rowCount} latestDate=${latestDate} latestSnapshot=${latestSnapshot} ppRows=${audit.ppRowCount} udRows=${audit.udRowCount} duplicateWarnings=${audit.duplicateWarningCount}${matchTypesLog}`
    );
  }

  const auditPath = getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON);
  const auditPayload = {
    generatedAt: new Date().toISOString(),
    nba: auditByLabel["NBA"] ?? null,
    mlb: auditByLabel["MLB"] ?? null,
  };
  try {
    const artifactsDir = path.dirname(auditPath);
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(auditPath, JSON.stringify(auditPayload, null, 2), "utf8");
    console.log(`[PROP_WAREHOUSE] Audit written to ${auditPath}`);
  } catch (err) {
    console.warn("[PROP_WAREHOUSE] Failed to write audit JSON:", err);
  }
}

main().catch((err) => {
  console.error("[PROP_WAREHOUSE] Validation failed:", err);
  // Do not throw further; this is non-fatal relative to the optimizer.
  process.exitCode = 0;
});

