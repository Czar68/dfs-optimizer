/**
 * Writes data/reports/latest_calibration_surface.json and .md from data/perf_tracker.jsonl.
 * Read-only reporting; safe to run anytime.
 */

import fs from "fs";
import path from "path";
import { readTrackerRows } from "../perf_tracker_db";
import { buildCalibrationSurfaceReport, renderCalibrationSurfaceMarkdown } from "./calibration_surface";

export function exportCalibrationSurface(options?: { cwd?: string; outDir?: string }): {
  jsonPath: string;
  mdPath: string;
} {
  const root = options?.cwd ?? process.cwd();
  const outDir = options?.outDir ?? path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_calibration_surface.json");
  const mdPath = path.join(outDir, "latest_calibration_surface.md");

  const rows = readTrackerRows();
  const report = buildCalibrationSurfaceReport(rows, new Date().toISOString());
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderCalibrationSurfaceMarkdown(report), "utf8");
  return { jsonPath, mdPath };
}

if (require.main === module) {
  const { jsonPath, mdPath } = exportCalibrationSurface();
  console.log(`[export:calibration-surface] wrote ${jsonPath}`);
  console.log(`[export:calibration-surface] wrote ${mdPath}`);
}
