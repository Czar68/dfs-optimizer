/**
 * Phase 58 — PP `no_candidate` observability (combo vs single-player; reporting only).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MergeDropRecord } from "../src/merge_contract";
import { normalizePickPlayerKeyForDiagnostics } from "../src/merge_odds";
import {
  buildPpNoCandidateObservabilityReport,
  formatPpNoCandidateObservabilityMarkdown,
  isPrizepicksComboPlayerLabel,
  writePpNoCandidateObservabilityArtifacts,
} from "../src/reporting/merge_pp_no_candidate_observability";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

function drop(partial: Partial<MergeDropRecord> & Pick<MergeDropRecord, "player" | "stat" | "site" | "sport">): MergeDropRecord {
  return {
    line: 1,
    internalReason: "no_candidate",
    canonicalReason: "no_match",
    ...partial,
  };
}

describe("Phase 58 isPrizepicksComboPlayerLabel", () => {
  it("detects multi-player PP label substring", () => {
    expect(isPrizepicksComboPlayerLabel("A + B")).toBe(true);
    expect(isPrizepicksComboPlayerLabel("LeBron James")).toBe(false);
  });
});

describe("Phase 58 buildPpNoCandidateObservabilityReport", () => {
  it("ignores non-PP and non-no_candidate drops", () => {
    const drops: MergeDropRecord[] = [
      drop({ player: "A", stat: "points", site: "prizepicks", sport: "NBA" }),
      {
        site: "prizepicks",
        sport: "NBA",
        player: "B",
        stat: "points",
        line: 1,
        internalReason: "no_odds_stat",
        canonicalReason: "no_odds_stat",
      },
      drop({ player: "C", stat: "points", site: "underdog", sport: "NBA" }),
    ];
    const r = buildPpNoCandidateObservabilityReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: normalizePickPlayerKeyForDiagnostics,
    });
    expect(r.totals.ppNoCandidateDropCount).toBe(1);
    expect(r.totals.singlePlayerLabelCount).toBe(1);
    expect(r.totals.comboLabelCount).toBe(0);
  });

  it("splits combo vs single and aggregates single-player keys", () => {
    const drops: MergeDropRecord[] = [
      drop({ player: "Alpha B", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Alpha B", stat: "rebounds", site: "prizepicks", sport: "NBA" }),
      drop({ player: "X + Y", stat: "points_rebounds", site: "prizepicks", sport: "NBA" }),
      drop({ player: "X + Y", stat: "points_rebounds", site: "prizepicks", sport: "NBA" }),
    ];
    const r = buildPpNoCandidateObservabilityReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: (p) => p.toLowerCase().trim(),
    });
    expect(r.totals.ppNoCandidateDropCount).toBe(4);
    expect(r.totals.singlePlayerLabelCount).toBe(2);
    expect(r.totals.comboLabelCount).toBe(2);
    expect(r.totals.comboShareOfPpNoCandidate).toBeCloseTo(0.5, 5);
    expect(r.combo.noCandidateByStat.points_rebounds).toBe(2);
    const pk = "alpha b";
    expect(r.singlePlayer.noCandidateByNormalizedPlayer[pk]).toBe(2);
    expect(r.singlePlayer.noCandidateBySport.NBA).toBe(2);
    expect(r.singlePlayer.topSinglePlayerKeys[0]!.normalizedPlayerKey).toBe("alpha b");
    expect(r.singlePlayer.topSinglePlayerKeys[0]!.count).toBe(2);
  });

  it("deterministic stable JSON output", () => {
    const drops: MergeDropRecord[] = [
      drop({ player: "Zed", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Amy", stat: "points", site: "prizepicks", sport: "NBA" }),
    ];
    const r = buildPpNoCandidateObservabilityReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: (p) => p.toLowerCase(),
    });
    const once = stableStringifyForObservability(r);
    const twice = stableStringifyForObservability(JSON.parse(once));
    expect(twice).toBe(once);
  });

  it("writes json and md", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m58-"));
    const r = buildPpNoCandidateObservabilityReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops: [drop({ player: "P", stat: "steals", site: "prizepicks", sport: "NBA" })],
      normalizePickPlayerKey: (p) => p,
    });
    writePpNoCandidateObservabilityArtifacts(tmp, r);
    const j = path.join(tmp, "data", "reports", "latest_merge_pp_no_candidate_observability.json");
    const m = path.join(tmp, "data", "reports", "latest_merge_pp_no_candidate_observability.md");
    expect(fs.existsSync(j)).toBe(true);
    expect(fs.existsSync(m)).toBe(true);
    expect(fs.readFileSync(m, "utf8")).toContain("PrizePicks");
    expect(JSON.parse(fs.readFileSync(j, "utf8")).totals.ppNoCandidateDropCount).toBe(1);
  });
});

describe("Phase 58 formatPpNoCandidateObservabilityMarkdown", () => {
  it("includes combo share line", () => {
    const r = buildPpNoCandidateObservabilityReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops: [
        drop({ player: "A + B", stat: "points", site: "prizepicks", sport: "NBA" }),
        drop({ player: "A + B", stat: "points", site: "prizepicks", sport: "NBA" }),
      ],
      normalizePickPlayerKey: (p) => p,
    });
    const md = formatPpNoCandidateObservabilityMarkdown(r);
    expect(md).toContain("Combo");
    expect(md).toContain("100.0%");
  });
});
