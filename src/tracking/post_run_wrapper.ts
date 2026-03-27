export type WrapperStep = {
  name: string;
  command: string;
};

export type WrapperStepLog = {
  timestampUtc: string;
  step: string;
  command: string;
  exitCode: number;
  status: "success" | "failed" | "skipped";
  message: string;
};

export type CommandRunner = (command: string) => { exitCode: number; message?: string };

export function defaultPostRunSteps(): WrapperStep[] {
  return [
    { name: "capture_snapshot", command: "npm run capture:snapshot" },
    { name: "refresh_model_artifacts", command: "npm run refresh:model-artifacts" },
    /** Phase **111** — SSOT with **`scripts/post_run_model_refresh.ps1`** (invokes **`npm run refresh:validation-reporting`**). Phase **133**: optional **`publish:dashboard-live`** is env-gated in PS1 only (`DFS_AUTO_PUBLISH_DASHBOARD=1`). */
    { name: "refresh_validation_reporting", command: "npm run refresh:validation-reporting" },
  ];
}

export function formatWrapperLogLine(entry: WrapperStepLog): string {
  return JSON.stringify(entry);
}

export function runPostRunSteps(
  runner: CommandRunner,
  now: () => string = () => new Date().toISOString(),
  steps = defaultPostRunSteps()
): { ok: boolean; logs: WrapperStepLog[] } {
  const logs: WrapperStepLog[] = [];
  let ok = true;
  for (const step of steps) {
    const out = runner(step.command);
    const success = out.exitCode === 0;
    logs.push({
      timestampUtc: now(),
      step: step.name,
      command: step.command,
      exitCode: out.exitCode,
      status: success ? "success" : "failed",
      message: out.message ?? (success ? "completed" : "failed"),
    });
    if (!success) {
      ok = false;
      break;
    }
  }
  return { ok, logs };
}

export function runMainThenPostRun(
  runner: CommandRunner,
  mainCommand: string,
  now: () => string = () => new Date().toISOString()
): { ok: boolean; logs: WrapperStepLog[] } {
  const logs: WrapperStepLog[] = [];
  const main = runner(mainCommand);
  const mainOk = main.exitCode === 0;
  logs.push({
    timestampUtc: now(),
    step: "main_run",
    command: mainCommand,
    exitCode: main.exitCode,
    status: mainOk ? "success" : "failed",
    message: main.message ?? (mainOk ? "completed" : "failed"),
  });
  if (!mainOk) {
    logs.push({
      timestampUtc: now(),
      step: "post_run_refresh",
      command: "npm run postrun:model-refresh",
      exitCode: 0,
      status: "skipped",
      message: "skipped because main run failed",
    });
    return { ok: false, logs };
  }
  const post = runPostRunSteps(runner, now);
  return { ok: post.ok, logs: logs.concat(post.logs) };
}
