/**
 * Phase 109 — Dashboard overview parse + sync contract (no optimizer / policy logic changes).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { parseFeatureValidationOverviewDashboardJson } from "../src/reporting/feature_validation_overview_dashboard";
import {
  writeFeatureValidationOverviewArtifacts,
} from "../src/reporting/export_feature_validation_overview";
import { DASHBOARD_SYNC_OPTIONAL_FILES } from "../src/reporting/dashboard_sync_contract";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function row(leg_id: string): PerfTrackerRow {
  return {
    date: "2026-01-01",
    leg_id,
    player: "P",
    stat: "points",
    line: 1,
    book: "FD",
    trueProb: 0.5,
    projectedEV: 0,
    playedEV: 0,
    kelly: 0,
    card_tier: 1,
    result: 1,
    side: "over",
  } as PerfTrackerRow;
}

describe("Phase 109 — feature validation dashboard surface", () => {
  it("parse accepts committed fixture JSON", () => {
    const p = path.join(__dirname, "fixtures", "latest_feature_validation_overview_min.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const parsed = parseFeatureValidationOverviewDashboardJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.effectivePolicy).toBe("snapshot_preferred");
    expect(parsed!.replayReadiness.gradedRows).toBe(1);
    expect(parsed!.summaryLine).toContain("feature_validation_overview");
  });

  it("parse rejects empty object", () => {
    expect(parseFeatureValidationOverviewDashboardJson({})).toBeNull();
  });

  it("export overview JSON round-trips through dashboard parse (grounded)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p109-rt-"));
    const id = "prizepicks-rt-points-1-over";
    fs.writeFileSync(
      path.join(dir, "prizepicks-legs.csv"),
      `id,player,stat,line,book,league,trueProb,legEv,opponent\n${id},P,points,1,FD,NBA,0.5,0.01,BOS\n`,
      "utf8"
    );
    const trackerPath = path.join(dir, "data", "perf_tracker.jsonl");
    fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
    fs.writeFileSync(trackerPath, JSON.stringify(row(id)) + "\n", "utf8");
    writeFeatureValidationOverviewArtifacts({ cwd: dir, trackerPath });
    const jPath = path.join(dir, "data", "reports", "latest_feature_validation_overview.json");
    const raw = JSON.parse(fs.readFileSync(jPath, "utf8"));
    const parsed = parseFeatureValidationOverviewDashboardJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.replayReadiness.gradedRows).toBeGreaterThanOrEqual(1);
    expect(parsed!.summaryLine.length).toBeGreaterThan(10);
  });

  it("sync_dashboard_reports imports optional list from dashboard_sync_contract (overview remains optional)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "scripts", "sync_dashboard_reports.ts"), "utf8");
    expect(src).toContain("OPTIONAL_FILES");
    expect(src).toContain("dashboard_sync_contract");
    expect(DASHBOARD_SYNC_OPTIONAL_FILES).toContain("latest_feature_validation_overview.json");
  });
});
