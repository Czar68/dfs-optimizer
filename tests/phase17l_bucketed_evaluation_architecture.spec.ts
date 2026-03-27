import * as fs from "fs";
import * as path from "path";
import {
  APPROVED_PLATFORM_MATH_VARIANCE,
  EVALUATION_BUCKET_ORDER,
  getCanonicalBucketOrder,
  isContiguousBucketSlice,
  MATCH_MERGE_SHARED_ENTRYPOINT,
  runBucketSlice,
  runSingleBucket,
  type EvaluationBucketId,
} from "../src/pipeline/evaluation_buckets";

describe("Phase 17L — canonical bucketed evaluation architecture", () => {
  const expectedOrder: readonly EvaluationBucketId[] = [
    "ingest",
    "normalize",
    "match_merge",
    "shared_eligibility",
    "platform_math",
    "structure_evaluation",
    "selection_export",
    "render_input",
  ];

  it("canonical bucket order is deterministic (shared PP + UD contract)", () => {
    expect([...EVALUATION_BUCKET_ORDER]).toEqual([...expectedOrder]);
    expect([...getCanonicalBucketOrder()]).toEqual([...expectedOrder]);
  });

  it("PP slice pattern (ingest→shared_eligibility, platform_math, structure→render) is contiguous on the full order", () => {
    const full = EVALUATION_BUCKET_ORDER;
    expect(isContiguousBucketSlice(full, full.slice(0, 4), 0)).toBe(true);
    expect(isContiguousBucketSlice(full, [full[4]], 4)).toBe(true);
    expect(isContiguousBucketSlice(full, full.slice(5), 5)).toBe(true);
  });

  it("UD full tail (structure_evaluation → render_input) is one contiguous slice", () => {
    const full = EVALUATION_BUCKET_ORDER;
    expect(isContiguousBucketSlice(full, full.slice(5), 5)).toBe(true);
    expect(full.slice(5)).toEqual([
      "structure_evaluation",
      "selection_export",
      "render_input",
    ]);
  });

  it("runBucketSlice rejects out-of-order step ids vs expected slice", async () => {
    await expect(
      runBucketSlice("pp", ["ingest", "normalize"], [
        { id: "normalize", run: async () => {} },
        { id: "ingest", run: async () => {} },
      ])
    ).rejects.toThrow(/ingest/);
  });

  it("runSingleBucket runs one stage with ordering validation", async () => {
    let n = 0;
    await runSingleBucket("ud", "ingest", async () => {
      n = 1;
    });
    expect(n).toBe(1);
  });

  it("documents shared OddsAPI-linked match_merge entrypoint (mergeWithSnapshot)", () => {
    expect(MATCH_MERGE_SHARED_ENTRYPOINT).toContain("mergeWithSnapshot");
  });

  it("approved platform-math variance is explicit for PP and UD", () => {
    expect(APPROVED_PLATFORM_MATH_VARIANCE.pp.join(" ").length).toBeGreaterThan(20);
    expect(APPROVED_PLATFORM_MATH_VARIANCE.ud.join(" ").length).toBeGreaterThan(20);
  });

  it("static: PrizePicks + Underdog main runners wire runBucketSlice / evaluation_buckets", () => {
    const root = path.join(__dirname, "..");
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./pipeline/evaluation_buckets"');
    expect(ro).toContain("runBucketSlice(");
    expect(ro).toContain("EVALUATION_BUCKET_ORDER");
    expect(ud).toContain('from "./pipeline/evaluation_buckets"');
    expect(ud).toContain("runBucketSlice(");
    expect(ud).toContain("EVALUATION_BUCKET_ORDER");
  });

  it("static: OddsAPI-linked merge stays in merge_odds (shared match_merge primitive)", () => {
    const mergeSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "merge_odds.ts"),
      "utf8"
    );
    expect(mergeSrc).toMatch(/export async function mergeWithSnapshot/);
  });

  it("static: UD live path invokes mergeWithSnapshot inside match_merge bucket (no hidden merge fork)", () => {
    const ud = fs.readFileSync(
      path.join(__dirname, "..", "src", "run_underdog_optimizer.ts"),
      "utf8"
    );
    const matchIdx = ud.indexOf('id: "match_merge"');
    expect(matchIdx).toBeGreaterThan(0);
    expect(ud.indexOf("mergeWithSnapshot", matchIdx)).toBeGreaterThan(matchIdx);
  });

  it("static: PP live path invokes mergeWithSnapshot inside match_merge bucket", () => {
    const ro = fs.readFileSync(
      path.join(__dirname, "..", "src", "run_optimizer.ts"),
      "utf8"
    );
    const matchIdx = ro.indexOf('id: "match_merge"');
    expect(matchIdx).toBeGreaterThan(0);
    expect(ro.indexOf("mergeWithSnapshot", matchIdx)).toBeGreaterThan(matchIdx);
  });

  it("static: post–platform_math PP leg thresholds stay on runtime_decision_pipeline helpers (17K)", () => {
    const ro = fs.readFileSync(
      path.join(__dirname, "..", "src", "run_optimizer.ts"),
      "utf8"
    );
    expect(ro).toContain("filterPpLegsByMinEdge");
    expect(ro).toContain("filterPpLegsGlobalPlayerCap");
    expect(ro).toContain("./policy/runtime_decision_pipeline");
    expect(ro).toContain('id: "platform_math"');
  });

  it("static: UD platform_math stage calls filterEvPicks (delegates to filterUdEvPicksCanonical / 17K)", () => {
    const ud = fs.readFileSync(
      path.join(__dirname, "..", "src", "run_underdog_optimizer.ts"),
      "utf8"
    );
    const pm = ud.indexOf('id: "platform_math"');
    expect(pm).toBeGreaterThan(0);
    expect(ud.indexOf("filterEvPicks", pm)).toBeGreaterThan(pm);
    expect(ud).toContain("filterUdEvPicksCanonical");
  });
});
