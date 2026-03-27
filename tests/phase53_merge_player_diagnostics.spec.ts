/**
 * Phase 53 — `no_candidate` player-bucket diagnostics (additive reporting only).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MergeDropRecord } from "../src/merge_contract";
import { normalizePickPlayerKeyForDiagnostics } from "../src/merge_odds";
import {
  buildMergePlayerDiagnosticsReport,
  formatMergePlayerDiagnosticsMarkdown,
  writeMergePlayerDiagnosticsArtifacts,
} from "../src/reporting/merge_player_diagnostics";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

function drop(partial: Partial<MergeDropRecord> & Pick<MergeDropRecord, "player" | "stat" | "site" | "sport">): MergeDropRecord {
  return {
    line: 1,
    internalReason: "no_candidate",
    canonicalReason: "no_match",
    ...partial,
  };
}

describe("Phase 53 buildMergePlayerDiagnosticsReport", () => {
  it("aggregates no_candidate only; ignores other internal reasons", () => {
    const drops: MergeDropRecord[] = [
      drop({ player: "Alpha B", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Alpha B", stat: "rebounds", site: "prizepicks", sport: "NBA" }),
      {
        site: "prizepicks",
        sport: "NBA",
        player: "Gamma C",
        stat: "points",
        line: 1,
        internalReason: "no_odds_stat",
        canonicalReason: "no_odds_stat",
      },
    ];
    const r = buildMergePlayerDiagnosticsReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: normalizePickPlayerKeyForDiagnostics,
    });
    expect(r.totals.noCandidateDropCount).toBe(2);
    const pk = normalizePickPlayerKeyForDiagnostics("Alpha B");
    expect(r.noCandidateByNormalizedPlayer[pk]).toBe(2);
    expect(r.noCandidateByPlayerAndStat[pk]?.points).toBe(1);
    expect(r.noCandidateByPlayerAndStat[pk]?.rebounds).toBe(1);
  });

  it("sorts topNoCandidatePlayers by count desc then key asc (deterministic)", () => {
    const drops: MergeDropRecord[] = [
      drop({ player: "Zed Last", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Amy First", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Bob Mid", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Bob Mid", stat: "assists", site: "prizepicks", sport: "NBA" }),
    ];
    const r = buildMergePlayerDiagnosticsReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: (p) => p.toLowerCase().trim(),
    });
    expect(r.topNoCandidatePlayers[0]!.count).toBe(2);
    expect(r.topNoCandidatePlayers[0]!.normalizedPlayerKey).toBe("bob mid");
    expect(r.topNoCandidatePlayers[1]!.normalizedPlayerKey).toBe("amy first");
    expect(r.topNoCandidatePlayers[2]!.normalizedPlayerKey).toBe("zed last");
  });

  it("concentration: insufficient_data when zero no_candidate", () => {
    const r = buildMergePlayerDiagnosticsReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops: [],
      normalizePickPlayerKey: (p) => p,
    });
    expect(r.concentration.interpretation).toBe("insufficient_data");
    expect(r.concentration.top1ShareOfNoCandidate).toBe(null);
  });

  it("concentration: high_top_key_concentration when top key ≥50%", () => {
    const drops: MergeDropRecord[] = [
      drop({ player: "Same", stat: "points", site: "prizepicks", sport: "NBA" }),
      drop({ player: "Same", stat: "points", site: "underdog", sport: "NBA" }),
    ];
    const r = buildMergePlayerDiagnosticsReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: () => "samekey",
    });
    expect(r.totals.noCandidateDropCount).toBe(2);
    expect(r.concentration.top1ShareOfNoCandidate).toBe(1);
    expect(r.concentration.interpretation).toBe("high_top_key_concentration");
  });

  it("stable JSON output is idempotent", () => {
    const drops: MergeDropRecord[] = [drop({ player: "X Y", stat: "points", site: "prizepicks", sport: "NBA" })];
    const r = buildMergePlayerDiagnosticsReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: (p) => p.toLowerCase(),
    });
    const once = stableStringifyForObservability(r);
    const twice = stableStringifyForObservability(JSON.parse(once));
    expect(twice).toBe(once);
  });

  it("writes JSON + MD under data/reports", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p53-"));
    const drops: MergeDropRecord[] = [drop({ player: "Test Player", stat: "points", site: "prizepicks", sport: "NBA" })];
    const r = buildMergePlayerDiagnosticsReport({
      generatedAtUtc: "g1",
      sourceAuditGeneratedAtUtc: "a1",
      drops,
      normalizePickPlayerKey: normalizePickPlayerKeyForDiagnostics,
    });
    writeMergePlayerDiagnosticsArtifacts(tmp, r);
    const jsonPath = path.join(tmp, "data", "reports", "latest_merge_player_diagnostics.json");
    const mdPath = path.join(tmp, "data", "reports", "latest_merge_player_diagnostics.md");
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(formatMergePlayerDiagnosticsMarkdown(r)).toContain("no_candidate");
  });
});
