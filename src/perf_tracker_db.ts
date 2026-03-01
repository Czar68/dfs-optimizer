// src/perf_tracker_db.ts
// Append and read from data/perf_tracker.jsonl.

import fs from "fs";
import path from "path";
import { PerfTrackerRow, PERF_TRACKER_PATH, parseTrackerLine } from "./perf_tracker_types";

export function ensureDataDir(): void {
  const dir = path.dirname(PERF_TRACKER_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function appendTrackerRow(row: PerfTrackerRow): void {
  ensureDataDir();
  const fullPath = path.join(process.cwd(), PERF_TRACKER_PATH);
  const line = JSON.stringify(row) + "\n";
  fs.appendFileSync(fullPath, line, "utf8");
}

export function readTrackerRows(): PerfTrackerRow[] {
  const fullPath = path.join(process.cwd(), PERF_TRACKER_PATH);
  if (!fs.existsSync(fullPath)) return [];
  const raw = fs.readFileSync(fullPath, "utf8");
  const rows: PerfTrackerRow[] = [];
  for (const line of raw.split("\n")) {
    const row = parseTrackerLine(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function readTrackerRowsWithResult(): PerfTrackerRow[] {
  return readTrackerRows().filter((r) => r.result === 0 || r.result === 1);
}

export function writeTrackerRows(rows: PerfTrackerRow[]): void {
  ensureDataDir();
  const fullPath = path.join(process.cwd(), PERF_TRACKER_PATH);
  const lines = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  fs.writeFileSync(fullPath, lines, "utf8");
}
