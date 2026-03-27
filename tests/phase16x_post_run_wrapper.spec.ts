import {
  formatWrapperLogLine,
  runMainThenPostRun,
  runPostRunSteps,
} from "../src/tracking/post_run_wrapper";

describe("Phase 16X post-run automation wrapper", () => {
  it("runs post-run steps in deterministic order", () => {
    const calls: string[] = [];
    const out = runPostRunSteps(
      (cmd) => {
        calls.push(cmd);
        return { exitCode: 0, message: "ok" };
      },
      () => "2026-03-20T00:00:00.000Z"
    );
    expect(out.ok).toBe(true);
    expect(calls).toEqual([
      "npm run capture:snapshot",
      "npm run refresh:model-artifacts",
      "npm run refresh:validation-reporting",
    ]);
    expect(out.logs.map((x) => x.step)).toEqual([
      "capture_snapshot",
      "refresh_model_artifacts",
      "refresh_validation_reporting",
    ]);
  });

  it("skips downstream post-run when main run fails", () => {
    const calls: string[] = [];
    const out = runMainThenPostRun(
      (cmd) => {
        calls.push(cmd);
        if (cmd === "main") return { exitCode: 1, message: "main failed" };
        return { exitCode: 0, message: "ok" };
      },
      "main",
      () => "2026-03-20T00:00:00.000Z"
    );
    expect(out.ok).toBe(false);
    expect(calls).toEqual(["main"]);
    expect(out.logs[1]?.status).toBe("skipped");
  });

  it("emits deterministic log line shape and repeat-safe behavior", () => {
    const now = () => "2026-03-20T00:00:00.000Z";
    const runner = () => ({ exitCode: 0, message: "ok" });
    const a = runPostRunSteps(runner, now);
    const b = runPostRunSteps(runner, now);
    expect(a.logs).toHaveLength(3);
    expect(b.logs).toHaveLength(3);
    const line = formatWrapperLogLine(a.logs[0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.step).toBe("capture_snapshot");
    expect(parsed.status).toBe("success");
    expect(parsed.timestampUtc).toBe("2026-03-20T00:00:00.000Z");
  });
});
