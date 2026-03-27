/**
 * Phase 16P: lightweight periodic snapshot capture for CLV coverage.
 * Reads current normalized odds cache and writes compact snapshot rows
 * compatible with Phase 16O reconciler.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { InternalPlayerPropOdds } from "../types";

type LightweightSnapshotRow = {
  league: string;
  player: string;
  stat: string;
  line: number;
  overOdds?: number;
  underOdds?: number;
  book?: string;
};

type LightweightSnapshotFile = {
  snapshotId: string;
  fetchedAtUtc: string;
  source: "OddsAPI";
  includeAltLines: boolean;
  requestParamsHash: string;
  totalRows: number;
  rows: LightweightSnapshotRow[];
  capturedAtUtc: string;
  sourceType: "odds_cache";
};

function hashRows(rows: LightweightSnapshotRow[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 8);
}

function toLightweightRow(r: InternalPlayerPropOdds): LightweightSnapshotRow | null {
  if (!r.player || !r.stat || !Number.isFinite(r.line)) return null;
  return {
    league: r.league || "NBA",
    player: r.player,
    stat: String(r.stat),
    line: r.line,
    overOdds: typeof r.overOdds === "number" ? r.overOdds : undefined,
    underOdds: typeof r.underOdds === "number" ? r.underOdds : undefined,
    book: r.book || undefined,
  };
}

function readOddsCacheRows(rootDir: string): { rows: InternalPlayerPropOdds[]; fetchedAtUtc: string } {
  const cachePath = path.join(rootDir, "data", "odds_cache.json");
  if (!fs.existsSync(cachePath)) throw new Error(`Missing ${cachePath}`);
  const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as { ts?: number; data?: InternalPlayerPropOdds[] };
  if (!Array.isArray(parsed.data)) throw new Error("odds_cache.json missing data[]");
  const fetchedAtUtc =
    typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
      ? new Date(parsed.ts).toISOString()
      : new Date().toISOString();
  return { rows: parsed.data, fetchedAtUtc };
}

export function captureOddsSnapshot(options?: { rootDir?: string }): {
  filePath?: string;
  rows: number;
  written: boolean;
  reason?: string;
} {
  const rootDir = options?.rootDir ?? process.cwd();
  const snapshotsDir = path.join(rootDir, "data", "odds_snapshots");
  const { rows: rawRows, fetchedAtUtc } = readOddsCacheRows(rootDir);
  const rows = rawRows.map(toLightweightRow).filter((x): x is LightweightSnapshotRow => x != null);
  const requestParamsHash = hashRows(rows);
  const snapshotId = crypto
    .createHash("sha256")
    .update(`${fetchedAtUtc}|${rows.length}|${requestParamsHash}`)
    .digest("hex")
    .slice(0, 12);
  const fileName = `OddsAPI_NBA_${fetchedAtUtc.replace(/[:.]/g, "-").slice(0, 19)}_${requestParamsHash}.json`;
  const filePath = path.join(snapshotsDir, fileName);

  if (fs.existsSync(filePath)) {
    return { rows: rows.length, written: false, reason: "snapshot already exists" };
  }

  const payload: LightweightSnapshotFile = {
    snapshotId,
    fetchedAtUtc,
    source: "OddsAPI",
    includeAltLines: true,
    requestParamsHash,
    totalRows: rows.length,
    rows,
    capturedAtUtc: new Date().toISOString(),
    sourceType: "odds_cache",
  };
  if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { filePath, rows: rows.length, written: true };
}

if (require.main === module) {
  const out = captureOddsSnapshot();
  if (out.written) {
    console.log(`[capture:snapshot] wrote ${out.rows} rows -> ${out.filePath}`);
  } else {
    console.log(`[capture:snapshot] skipped (${out.reason}); rows=${out.rows}`);
  }
}

