import { captureOddsSnapshot } from "./capture_odds_snapshot";
import { reconcileClosingLines } from "./reconcile_closing_lines";
import { exportModelDataset } from "./export_model_dataset";
import { exportModelEvaluation } from "./export_model_evaluation";
import { exportProbabilityCalibration } from "./export_probability_calibration";
import { exportCalibrationReadiness } from "./export_calibration_readiness";
import { exportCoverageDiagnostics } from "./export_coverage_diagnostics";
import { exportSnapshotCoverageGaps } from "./export_snapshot_coverage_gaps";
import { exportOpsCoveragePlaybook } from "./export_ops_coverage_playbook";

export type RefreshStep = {
  name: string;
  run: () => unknown;
};

export function defaultRefreshSteps(): RefreshStep[] {
  return [
    {
      name: "capture:snapshot",
      run: () => captureOddsSnapshot(),
    },
    {
      name: "reconcile:clv",
      run: () => reconcileClosingLines(),
    },
    {
      name: "export:model-data",
      run: () => exportModelDataset(),
    },
    {
      name: "export:model-eval",
      run: () => exportModelEvaluation(),
    },
    {
      name: "export:calibration",
      run: () => exportProbabilityCalibration(),
    },
    {
      name: "export:calibration-readiness",
      run: () => exportCalibrationReadiness(),
    },
    {
      name: "export:coverage-diagnostics",
      run: () => exportCoverageDiagnostics(),
    },
    {
      name: "export:snapshot-gaps",
      run: () => exportSnapshotCoverageGaps(),
    },
    {
      name: "export:ops-playbook",
      run: () => exportOpsCoveragePlaybook(),
    },
  ];
}

export function refreshModelArtifacts(steps = defaultRefreshSteps()): {
  ok: boolean;
  completed: string[];
  failedStep?: string;
  error?: string;
} {
  const completed: string[] = [];
  try {
    for (const step of steps) {
      console.log(`[refresh:model-artifacts] step=${step.name} start`);
      step.run();
      completed.push(step.name);
      console.log(`[refresh:model-artifacts] step=${step.name} done`);
    }
    console.log(`[refresh:model-artifacts] completed ${completed.length} steps`);
    return { ok: true, completed };
  } catch (e) {
    const failedStep = steps[completed.length]?.name;
    const error = (e as Error).message;
    console.error(`[refresh:model-artifacts] failed at step=${failedStep}: ${error}`);
    return { ok: false, completed, failedStep, error };
  }
}

if (require.main === module) {
  const result = refreshModelArtifacts();
  if (!result.ok) process.exit(1);
}

