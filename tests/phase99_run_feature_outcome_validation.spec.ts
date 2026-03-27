import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  loadEvPicksJsonFile,
  parseRunFeatureOutcomeValidationArgs,
  resolveInputPath,
} from "../scripts/run_feature_outcome_validation";
const repoRoot = path.join(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "run_feature_outcome_validation.ts");

describe("Phase 99 — run_feature_outcome_validation", () => {
  it("parseRunFeatureOutcomeValidationArgs requires --input", () => {
    const r = parseRunFeatureOutcomeValidationArgs([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("--input");
  });

  it("parseRunFeatureOutcomeValidationArgs rejects invalid --generated-at", () => {
    const r = parseRunFeatureOutcomeValidationArgs([
      "--input=foo.json",
      "--generated-at=not-a-date",
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("generated-at");
  });

  it("parseRunFeatureOutcomeValidationArgs resolves cwd and generated-at", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fov-parse-"));
    const r = parseRunFeatureOutcomeValidationArgs([
      "--input=data/picks.json",
      `--cwd=${cwd}`,
      "--generated-at=2026-01-02T03:04:05.000Z",
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cwd).toBe(path.resolve(cwd));
      expect(r.generatedAtUtc).toBe("2026-01-02T03:04:05.000Z");
    }
  });

  it("loadEvPicksJsonFile fails clearly on missing file", () => {
    expect(() => loadEvPicksJsonFile(path.join(os.tmpdir(), "missing-fov-xyz.json"))).toThrow(/not found/);
  });

  it("loadEvPicksJsonFile fails clearly on invalid JSON", () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fov-")), "bad.json");
    fs.writeFileSync(tmp, "{", "utf8");
    expect(() => loadEvPicksJsonFile(tmp)).toThrow(/Invalid JSON/);
  });

  it("loadEvPicksJsonFile fails clearly on non-array", () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fov-")), "obj.json");
    fs.writeFileSync(tmp, JSON.stringify({ a: 1 }), "utf8");
    expect(() => loadEvPicksJsonFile(tmp)).toThrow(/Expected JSON array/);
  });

  it("CLI writes json and md deterministically with fixed --generated-at", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fov-run-"));
    const picksPath = path.join(dir, "picks.json");
    const picks = [
      {
        id: "1",
        sport: "NBA",
        site: "prizepicks",
        league: "NBA",
        player: "A",
        team: null,
        opponent: null,
        stat: "points",
        line: 20,
        projectionId: "p",
        gameId: null,
        startTime: null,
        outcome: "over",
        trueProb: 0.5,
        fairOdds: -110,
        edge: 0,
        book: null,
        overOdds: null,
        underOdds: null,
        legEv: 0,
        isNonStandardOdds: false,
        gradedLegOutcome: "hit" as const,
        featureSignals: {
          subjectId: "1",
          asOfUtc: "t",
          signals: {
            minutes_signal: 0.5,
            usage_signal: 0.5,
            environment_signal: 0.5,
            defense_signal: 0.5,
          },
        },
      },
    ];
    fs.writeFileSync(picksPath, JSON.stringify(picks), "utf8");

    const ts = "2026-03-22T12:00:00.000Z";
    const run = () =>
      execSync(
        `npx ts-node "${scriptPath}" --input="${picksPath}" --cwd="${dir}" --generated-at="${ts}"`,
        { encoding: "utf8", cwd: repoRoot }
      );

    const out1 = run();
    expect(out1).toContain("input_picks=1");
    expect(out1).toContain("evaluation_rows=1");
    expect(out1).toContain("latest_feature_outcome_validation.json");

    const jPath = path.join(dir, "data", "reports", "latest_feature_outcome_validation.json");
    const mPath = path.join(dir, "data", "reports", "latest_feature_outcome_validation.md");
    expect(fs.existsSync(jPath)).toBe(true);
    expect(fs.existsSync(mPath)).toBe(true);
    const jsonAfterFirst = fs.readFileSync(jPath, "utf8");
    run();
    const jsonAfterSecond = fs.readFileSync(jPath, "utf8");
    expect(jsonAfterFirst).toBe(jsonAfterSecond);
    expect(JSON.parse(jsonAfterFirst).generatedAtUtc).toBe(ts);
  });

  it("CLI exits 1 without --input", () => {
    expect(() =>
      execSync(`npx ts-node "${scriptPath}"`, { encoding: "utf8", cwd: repoRoot, stdio: "pipe" })
    ).toThrow();
  });
});

describe("resolveInputPath", () => {
  it("joins relative paths to cwd", () => {
    expect(resolveInputPath("/proj", "a/b.json")).toBe(path.resolve("/proj", "a/b.json"));
  });
  it("keeps absolute paths", () => {
    const abs = path.join(os.tmpdir(), "x.json");
    expect(resolveInputPath("/proj", abs)).toBe(path.normalize(abs));
  });
});
