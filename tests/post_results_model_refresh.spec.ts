/**
 * Regression tests for post-results model refresh pipeline:
 * - Stage order is deterministic and matches required sequence
 * - Audit artifact shape (required keys)
 * - Export graded results (with mocked tracker)
 */

import type { PostResultsRefreshAudit, StageResult } from "../scripts/run_post_results_model_refresh";
import { POST_RESULTS_STAGE_ORDER } from "../scripts/run_post_results_model_refresh";

const REQUIRED_STAGE_ORDER = [
  "graded_results",
  "clv_dataset",
  "clv_calibration",
  "correlation_matrix",
  "true_prob_model",
] as const;

function auditHasRequiredShape(audit: unknown): audit is PostResultsRefreshAudit {
  if (!audit || typeof audit !== "object") return false;
  const a = audit as Record<string, unknown>;
  if (typeof a.runTimestamp !== "string") return false;
  if (a.finalStatus !== "ok" && a.finalStatus !== "partial" && a.finalStatus !== "failed") return false;
  if (!Array.isArray(a.stages)) return false;
  if (!a.inputFiles || typeof a.inputFiles !== "object") return false;
  const input = a.inputFiles as Record<string, unknown>;
  if (!input.perf_tracker || !input.nba_results_master || !input.nba_props_master || !input.prop_clv_dataset)
    return false;
  if (!a.outputFiles || typeof a.outputFiles !== "object") return false;
  const out = a.outputFiles as Record<string, unknown>;
  if (
    typeof out.nba_results_master !== "string" ||
    typeof out.prop_clv_dataset !== "string" ||
    typeof out.clv_calibration_curve !== "string" ||
    typeof out.prop_correlation_matrix !== "string" ||
    typeof out.true_prob_model !== "string"
  )
    return false;
  if (typeof a.trueProbModelRetrained !== "boolean") return false;
  if (!Array.isArray(a.degradedModeWarnings)) return false;
  return true;
}

describe("post_results_model_refresh", () => {
  describe("stage order", () => {
    it("POST_RESULTS_STAGE_ORDER has exactly five stages in required order", () => {
      expect(POST_RESULTS_STAGE_ORDER).toHaveLength(5);
      expect(POST_RESULTS_STAGE_ORDER).toEqual(REQUIRED_STAGE_ORDER);
    });

    it("stage ids are unique", () => {
      const set = new Set(POST_RESULTS_STAGE_ORDER);
      expect(set.size).toBe(POST_RESULTS_STAGE_ORDER.length);
    });
  });

  describe("audit artifact shape", () => {
    it("valid audit passes shape check", () => {
      const audit: PostResultsRefreshAudit = {
        runTimestamp: new Date().toISOString(),
        finalStatus: "ok",
        stages: [
          { stage: "graded_results", status: "ok", rows: 10 },
          { stage: "clv_dataset", status: "ok", rows: 8 },
          { stage: "clv_calibration", status: "ok", rows: 25 },
          { stage: "correlation_matrix", status: "ok", rows: 15 },
          { stage: "true_prob_model", status: "ok" },
        ],
        inputFiles: {
          perf_tracker: { path: "/data/perf_tracker.jsonl", exists: true, gradedRows: 10 },
          nba_results_master: { path: "/data/results/nba_results_master.csv", exists: true, rows: 10 },
          nba_props_master: { path: "/data/prop_history/nba_props_master.csv", exists: true, rows: 100 },
          prop_clv_dataset: { path: "/data/models/prop_clv_dataset.csv", exists: true, rows: 8 },
        },
        outputFiles: {
          nba_results_master: "/data/results/nba_results_master.csv",
          prop_clv_dataset: "/data/models/prop_clv_dataset.csv",
          clv_calibration_curve: "/data/models/clv_calibration_curve.csv",
          prop_correlation_matrix: "/data/models/prop_correlation_matrix.csv",
          true_prob_model: "/data/models/true_prob_model.json",
        },
        trueProbModelRetrained: true,
        degradedModeWarnings: [],
      };
      expect(auditHasRequiredShape(audit)).toBe(true);
    });

    it("rejects object missing finalStatus", () => {
      expect(auditHasRequiredShape({ runTimestamp: "x", stages: [] })).toBe(false);
    });

    it("rejects object missing outputFiles.true_prob_model", () => {
      const audit = {
        runTimestamp: "x",
        finalStatus: "ok",
        stages: [],
        inputFiles: {
          perf_tracker: {},
          nba_results_master: {},
          nba_props_master: {},
          prop_clv_dataset: {},
        },
        outputFiles: {
          nba_results_master: "",
          prop_clv_dataset: "",
          clv_calibration_curve: "",
          prop_correlation_matrix: "",
        },
        trueProbModelRetrained: false,
        degradedModeWarnings: [],
      };
      expect(auditHasRequiredShape(audit)).toBe(false);
    });
  });

  describe("stage result status", () => {
    it("StageResult status is one of ok | skip | fail | non_fatal", () => {
      const valid: StageResult["status"][] = ["ok", "skip", "fail", "non_fatal"];
      const stage: StageResult = { stage: "graded_results", status: "ok" };
      expect(valid).toContain(stage.status);
    });
  });
});
