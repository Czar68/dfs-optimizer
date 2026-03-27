import * as fs from "fs";
import * as path from "path";
import { EVALUATION_BUCKET_ORDER, type EvaluationBucketId } from "../src/pipeline/evaluation_buckets";

describe("Phase 17M — full 8/8 site-invariant bucket parity", () => {
  const root = path.join(__dirname, "..");
  const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
  const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");

  it("PP and UD reference the same canonical 8 bucket ids (contract order)", () => {
    const expected: EvaluationBucketId[] = [...EVALUATION_BUCKET_ORDER];
    for (const id of expected) {
      expect(ro).toMatch(new RegExp(`id:\\s*"${id}"`));
      expect(ud).toMatch(new RegExp(`id:\\s*"${id}"`));
    }
  });

  it("PP executes structure_evaluation, selection_export, render_input via explicit runBucketSlice (not ad hoc tail)", () => {
    expect(ro).toContain("PP_SLICE_STRUCT_RENDER");
    const idxSlice = ro.indexOf("PP_SLICE_STRUCT_RENDER = EVALUATION_BUCKET_ORDER.slice(5)");
    expect(idxSlice).toBeGreaterThan(0);
    const idxMainTail = ro.indexOf("await runBucketSlice(\"pp\", PP_SLICE_STRUCT_RENDER", idxSlice);
    expect(idxMainTail).toBeGreaterThan(idxSlice);
    const tailSection = ro.slice(idxMainTail, idxMainTail + 12000);
    expect(tailSection).toContain('id: "structure_evaluation"');
    expect(tailSection).toContain('id: "selection_export"');
    expect(tailSection).toContain('id: "render_input"');
  });

  it("PP: no legacy 'Persist filtered legs' inline block (legs live in selection_export bucket)", () => {
    expect(ro).not.toContain("Persist filtered legs to JSON");
  });

  it("PP: prizepicks-legs.json write occurs after selection_export bucket id (artifact ordering)", () => {
    const sel = ro.indexOf('id: "selection_export"');
    expect(sel).toBeGreaterThan(0);
    expect(ro.indexOf("prizepicks-legs.json", sel)).toBeGreaterThan(sel);
  });

  it("PP: clipboard / render shaping occurs after render_input bucket id", () => {
    const ri = ro.indexOf('id: "render_input"');
    expect(ri).toBeGreaterThan(0);
    expect(ro.indexOf("COPY-TO-CLIPBOARD", ri)).toBeGreaterThan(ri);
  });

  it("PP insufficient-legs early exit still runs all three tail bucket names (noop structure + export legs + noop render)", () => {
    const ins = ro.indexOf("filtered.length < minLegsNeeded");
    expect(ins).toBeGreaterThan(0);
    const chunk = ro.slice(ins, ins + 2500);
    expect(chunk).toContain("PP_SLICE_STRUCT_RENDER");
    expect(chunk).toContain('id: "structure_evaluation"');
    expect(chunk).toContain('id: "selection_export"');
    expect(chunk).toContain('id: "render_input"');
  });

  it("Phase 17K invariant: run_optimizer still imports runtime_decision_pipeline canonical helpers", () => {
    expect(ro).toContain("./policy/runtime_decision_pipeline");
    expect(ro).toContain("filterPpLegsByMinEdge");
    expect(ro).toContain('id: "platform_math"');
  });

  it("Phase 17L invariant: mergeWithSnapshot remains inside PP match_merge bucket", () => {
    const m = ro.indexOf('id: "match_merge"');
    expect(m).toBeGreaterThan(0);
    expect(ro.indexOf("mergeWithSnapshot", m)).toBeGreaterThan(m);
  });

  it("single const MIN_LEG_EV_REQUIREMENTS declaration (no duplicated card-prefilter table)", () => {
    const decls = ro.match(/const MIN_LEG_EV_REQUIREMENTS/g) ?? [];
    expect(decls.length).toBe(1);
  });
});
