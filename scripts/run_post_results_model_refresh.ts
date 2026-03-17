/**
 * Post-results model refresh pipeline.
 * Runs after results ingestion (e.g. track-results.ps1 scrape). Order:
 * 1) Validate/refresh graded results (export perf_tracker → nba_results_master)
 * 2) Update prop_clv_dataset.csv (build_clv_dataset)
 * 3) Rebuild clv_calibration_curve.csv (build_clv_calibration)
 * 4) Rebuild prop_correlation_matrix.csv (build_prop_correlations)
 * 5) Retrain true_prob_model.json (train_true_probability_model)
 *
 * Fail-loud: if an upstream stage fails, downstream stages are not run.
 * Writes artifacts/post-results-model-refresh.json with stage statuses and counts.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getDataPath, getArtifactsPath, NBA_PROPS_MASTER_CSV } from "../src/constants/paths";
import { exportGradedResultsFromTracker } from "../src/results/exportGradedResultsFromTracker";

const ROOT = process.cwd();

/** Canonical stage order for post-results refresh (tests assert this order). */
export const POST_RESULTS_STAGE_ORDER: StageId[] = [
  "graded_results",
  "clv_dataset",
  "clv_calibration",
  "correlation_matrix",
  "true_prob_model",
];

export type StageId =
  | "graded_results"
  | "clv_dataset"
  | "clv_calibration"
  | "correlation_matrix"
  | "true_prob_model";

export interface StageResult {
  stage: StageId;
  status: "ok" | "skip" | "fail" | "non_fatal";
  rows?: number;
  samples?: number;
  message?: string;
  outputPath?: string;
}

export interface PostResultsRefreshAudit {
  runTimestamp: string;
  finalStatus: "ok" | "partial" | "failed";
  stages: StageResult[];
  inputFiles: {
    perf_tracker: { path: string; exists: boolean; gradedRows?: number };
    nba_results_master: { path: string; exists: boolean; rows?: number };
    nba_props_master: { path: string; exists: boolean; rows?: number };
    prop_clv_dataset: { path: string; exists: boolean; rows?: number };
  };
  outputFiles: {
    nba_results_master: string;
    prop_clv_dataset: string;
    clv_calibration_curve: string;
    prop_correlation_matrix: string;
    true_prob_model: string;
  };
  trueProbModelRetrained: boolean;
  degradedModeWarnings: string[];
}

function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return Math.max(0, lines.length - 1); // exclude header
}

function runScript(scriptPath: string, stageId: StageId): { status: "ok" | "fail"; code: number } {
  console.log(`POST_RESULTS_REFRESH stage=${stageId} start`);
  try {
    execSync(`npx ts-node "${scriptPath}"`, {
      cwd: ROOT,
      stdio: "inherit",
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log(`POST_RESULTS_REFRESH stage=${stageId} status=ok`);
    return { status: "ok", code: 0 };
  } catch (err: unknown) {
    const code = err && typeof (err as { status?: number }).status === "number" ? (err as { status: number }).status : 1;
    console.error(`POST_RESULTS_REFRESH stage=${stageId} status=fail code=${code}`);
    return { status: "fail", code };
  }
}

function main(): void {
  const runTimestamp = new Date().toISOString();
  const stages: StageResult[] = [];
  const degradedWarnings: string[] = [];
  let finalStatus: "ok" | "partial" | "failed" = "ok";

  const perfTrackerPath = path.join(ROOT, "data", "perf_tracker.jsonl");
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const nbaPropsPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const clvDatasetPath = getDataPath(path.join("models", "prop_clv_dataset.csv"));
  const clvCurvePath = getDataPath(path.join("models", "clv_calibration_curve.csv"));
  const correlationPath = getDataPath(path.join("models", "prop_correlation_matrix.csv"));
  const trueProbModelPath = getDataPath(path.join("models", "true_prob_model.json"));

  // ─── Stage 1: graded results ─────────────────────────────────────────────
  try {
    const { rowsWritten, skipped } = exportGradedResultsFromTracker();
    stages.push({
      stage: "graded_results",
      status: "ok",
      rows: rowsWritten,
      message: `exported ${rowsWritten} graded rows`,
      outputPath: nbaResultsPath,
    });
    console.log(`POST_RESULTS_REFRESH stage=graded_results status=ok rows=${rowsWritten}`);
    if (rowsWritten === 0 && skipped > 0) {
      degradedWarnings.push("No graded rows in perf_tracker; nba_results_master may be empty.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stages.push({ stage: "graded_results", status: "fail", message: msg });
    console.error(`POST_RESULTS_REFRESH stage=graded_results status=fail`);
    finalStatus = "failed";
    writeAudit(runTimestamp, finalStatus, stages, degradedWarnings, false);
    process.exit(1);
  }

  // ─── Stage 2: CLV dataset ────────────────────────────────────────────────
  const buildClvDataset = path.join(ROOT, "scripts", "build_clv_dataset.ts");
  const r2 = runScript(buildClvDataset, "clv_dataset");
  const clvDatasetRows = fs.existsSync(clvDatasetPath) ? countLines(clvDatasetPath) : 0;
  stages.push({
    stage: "clv_dataset",
    status: r2.status === "ok" ? "ok" : "fail",
    rows: clvDatasetRows,
    outputPath: clvDatasetPath,
  });
  if (r2.status === "fail") {
    finalStatus = "failed";
    writeAudit(runTimestamp, finalStatus, stages, degradedWarnings, false);
    process.exit(1);
  }
  console.log(`POST_RESULTS_REFRESH stage=clv_dataset status=ok rows=${clvDatasetRows}`);

  // ─── Stage 3: CLV calibration ────────────────────────────────────────────
  const buildClvCalibration = path.join(ROOT, "scripts", "build_clv_calibration.ts");
  const r3 = runScript(buildClvCalibration, "clv_calibration");
  const clvCurveRows = fs.existsSync(clvCurvePath) ? countLines(clvCurvePath) : 0;
  stages.push({
    stage: "clv_calibration",
    status: r3.status === "ok" ? "ok" : "fail",
    rows: clvCurveRows,
    outputPath: clvCurvePath,
  });
  if (r3.status === "fail") {
    finalStatus = "failed";
    writeAudit(runTimestamp, finalStatus, stages, degradedWarnings, false);
    process.exit(1);
  }
  console.log(`POST_RESULTS_REFRESH stage=clv_calibration status=ok rows=${clvCurveRows}`);

  // ─── Stage 4: correlation matrix ──────────────────────────────────────────
  const buildCorrelations = path.join(ROOT, "scripts", "build_prop_correlations.ts");
  const r4 = runScript(buildCorrelations, "correlation_matrix");
  const correlationRows = fs.existsSync(correlationPath) ? countLines(correlationPath) : 0;
  stages.push({
    stage: "correlation_matrix",
    status: r4.status === "ok" ? "ok" : "fail",
    rows: correlationRows,
    outputPath: correlationPath,
  });
  if (r4.status === "fail") {
    finalStatus = "failed";
    writeAudit(runTimestamp, finalStatus, stages, degradedWarnings, false);
    process.exit(1);
  }
  console.log(`POST_RESULTS_REFRESH stage=correlation_matrix status=ok rows=${correlationRows}`);

  // ─── Stage 5: true prob model ────────────────────────────────────────────
  const trainTrueProb = path.join(ROOT, "scripts", "train_true_probability_model.ts");
  const r5 = runScript(trainTrueProb, "true_prob_model");
  const modelRetrained = r5.status === "ok" && fs.existsSync(trueProbModelPath);
  stages.push({
    stage: "true_prob_model",
    status: r5.status === "ok" ? "ok" : "fail",
    samples: modelRetrained ? undefined : 0,
    outputPath: trueProbModelPath,
  });
  if (r5.status === "fail") {
    finalStatus = "partial";
    degradedWarnings.push("True probability model training failed; optimizer will use previous model or fallback.");
  } else {
    console.log(`POST_RESULTS_REFRESH stage=true_prob_model status=ok samples=${modelRetrained ? "yes" : "no"}`);
  }

  writeAudit(runTimestamp, finalStatus, stages, degradedWarnings, modelRetrained);
  console.log(`POST_RESULTS_REFRESH final status=${finalStatus}`);
  // We only reach here when finalStatus is "ok" or "partial"; "failed" branches exit(1) above.
  process.exit(0);
}

if (require.main === module) {
  main();
}

function writeAudit(
  runTimestamp: string,
  finalStatus: "ok" | "partial" | "failed",
  stages: StageResult[],
  degradedWarnings: string[],
  trueProbModelRetrained: boolean
): void {
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const nbaPropsPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const clvDatasetPath = getDataPath(path.join("models", "prop_clv_dataset.csv"));
  const clvCurvePath = getDataPath(path.join("models", "clv_calibration_curve.csv"));
  const correlationPath = getDataPath(path.join("models", "prop_correlation_matrix.csv"));
  const trueProbModelPath = getDataPath(path.join("models", "true_prob_model.json"));

  const gradedResult = stages.find((s) => s.stage === "graded_results");
  const gradedRows = gradedResult?.rows ?? 0;

  const audit: PostResultsRefreshAudit = {
    runTimestamp,
    finalStatus,
    stages,
    inputFiles: {
      perf_tracker: {
        path: path.join(ROOT, "data", "perf_tracker.jsonl"),
        exists: fs.existsSync(path.join(ROOT, "data", "perf_tracker.jsonl")),
        gradedRows,
      },
      nba_results_master: {
        path: nbaResultsPath,
        exists: fs.existsSync(nbaResultsPath),
        rows: fs.existsSync(nbaResultsPath) ? countLines(nbaResultsPath) : 0,
      },
      nba_props_master: {
        path: nbaPropsPath,
        exists: fs.existsSync(nbaPropsPath),
        rows: fs.existsSync(nbaPropsPath) ? countLines(nbaPropsPath) : 0,
      },
      prop_clv_dataset: {
        path: clvDatasetPath,
        exists: fs.existsSync(clvDatasetPath),
        rows: fs.existsSync(clvDatasetPath) ? countLines(clvDatasetPath) : 0,
      },
    },
    outputFiles: {
      nba_results_master: nbaResultsPath,
      prop_clv_dataset: clvDatasetPath,
      clv_calibration_curve: clvCurvePath,
      prop_correlation_matrix: correlationPath,
      true_prob_model: trueProbModelPath,
    },
    trueProbModelRetrained,
    degradedModeWarnings: degradedWarnings,
  };

  const auditPath = getArtifactsPath("post-results-model-refresh.json");
  const artifactsDir = path.dirname(auditPath);
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), "utf8");
  console.log(`[POST_RESULTS_REFRESH] Wrote audit ${auditPath}`);
}
