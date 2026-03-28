/**
 * Contract: diag_ud_* scripts surface UD_FAIL_SHARED_MIN_EDGE vs UD_FAIL_MIN_EDGE distinctly.
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");
const scriptsDir = path.join(root, "scripts");

function read(name: string): string {
  return fs.readFileSync(path.join(scriptsDir, name), "utf8");
}

describe("diag_ud_* forensics — failure code distinction", () => {
  it("diag_ud_filter_failure_attribution initializes both UD_FAIL_SHARED_MIN_EDGE and UD_FAIL_MIN_EDGE", () => {
    const s = read("diag_ud_filter_failure_attribution.ts");
    expect(s).toContain("UD_FAIL_SHARED_MIN_EDGE");
    expect(s).toContain("[UD_FAIL_SHARED_MIN_EDGE]: 0");
    expect(s).toContain("[UD_FAIL_MIN_EDGE]: 0");
  });

  it("diag_ud_boosted_seam_audit references shared vs trueProb floor buckets", () => {
    const s = read("diag_ud_boosted_seam_audit.ts");
    expect(s).toContain("UD_FAIL_SHARED_MIN_EDGE");
    expect(s).toContain("allTrueProbFloor");
    expect(s).toContain("allSharedMinEdge");
  });

  it("diag_ud_min_edge_forensics splits shared min-edge vs trueProb floor output", () => {
    const s = read("diag_ud_min_edge_forensics.ts");
    expect(s).toContain("UD_FAIL_SHARED_MIN_EDGE");
    expect(s).toContain("UD_FAIL_MIN_EDGE_trueProbFloor");
  });

  it("diag_ud_min_edge_population_compare emits both subsets", () => {
    const s = read("diag_ud_min_edge_population_compare.ts");
    expect(s).toContain("UD_FAIL_SHARED_MIN_EDGE");
    expect(s).toContain("trueProbFloorSummary");
    expect(s).toContain("sharedMinEdgeSummary");
  });

  it("diag_ud_min_edge_normalized_denominator emits both subsets", () => {
    const s = read("diag_ud_min_edge_normalized_denominator.ts");
    expect(s).toContain("UD_FAIL_SHARED_MIN_EDGE");
    expect(s).toContain("udTrueProbFloorSubset");
    expect(s).toContain("udSharedMinEdgeSubset");
  });
});
