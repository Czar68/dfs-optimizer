// src/odds/odds_snapshot.ts
// Single canonical odds snapshot — guarantees PP and UD merges use the same data.

import crypto from "crypto";
import { SgoPlayerPropOdds, Sport } from "../types";

export type OddsRefreshMode = "live" | "cache" | "auto";

export interface OddsSnapshot {
  snapshotId: string;
  fetchedAtUtc: string;
  source: "SGO" | "TheRundown" | "none";
  refreshMode: OddsRefreshMode;
  includeAltLines: boolean;
  requestParamsHash: string;
  rows: SgoPlayerPropOdds[];
  ageMinutes: number;
}

export interface SnapshotDiskFormat {
  snapshotId: string;
  fetchedAtUtc: string;
  source: "SGO" | "TheRundown" | "none";
  includeAltLines: boolean;
  requestParamsHash: string;
  totalRows: number;
  rows: SgoPlayerPropOdds[];
}

export interface SnapshotState {
  lastLiveFetchedAtUtc: string | null;
  lastSnapshotId: string | null;
}

export function generateSnapshotId(fetchedAtUtc: string, source: string, rowCount: number): string {
  const raw = `${fetchedAtUtc}::${source}::${rowCount}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

export function hashRequestParams(sports: Sport[], includeAltLines: boolean): string {
  const raw = `sports=${sports.sort().join(",")}::alt=${includeAltLines}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 8);
}

export function computeAgeMinutes(fetchedAtUtc: string, now?: Date): number {
  const fetchedMs = new Date(fetchedAtUtc).getTime();
  const nowMs = (now ?? new Date()).getTime();
  return Math.max(0, (nowMs - fetchedMs) / 60_000);
}

export function formatSnapshotLogLine(snapshot: OddsSnapshot): string {
  return (
    `ODDS_SNAPSHOT id=${snapshot.snapshotId} ` +
    `fetchedAtUtc=${snapshot.fetchedAtUtc} ` +
    `ageMin=${snapshot.ageMinutes.toFixed(1)} ` +
    `refreshMode=${snapshot.refreshMode} ` +
    `includeAltLines=${snapshot.includeAltLines} ` +
    `rows=${snapshot.rows.length} ` +
    `source=${snapshot.source}`
  );
}
