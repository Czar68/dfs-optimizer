import fs from "fs";
import path from "path";
import {
  PHASE17V_SKIPPED_NEEDS_REVIEW,
  PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY,
  buildRepoHygieneAuditReport,
  getRepoHygieneAuditCandidates,
} from "../src/reporting/repo_hygiene_audit";
import { getSiteInvariantRuntimeContractStages } from "../src/reporting/site_invariant_runtime_contract";

const root = path.join(__dirname, "..");

describe("Phase 17W — behavior-neutral legacy naming cleanup (OddsAPI alias)", () => {
  it("report_single_bet_ev resolves fetchSgoPlayerPropOdds via canonical fetch_oddsapi_legacy_alias", () => {
    const t = fs.readFileSync(path.join(root, "src", "scripts", "report_single_bet_ev.ts"), "utf8");
    expect(t).toContain("from '../fetch_oddsapi_legacy_alias'");
    expect(t).not.toMatch(/from ['"]\.\.\/fetch_oddsapi_odds['"]/);
  });

  it("main optimizer entrypoint still uses fetch_oddsapi_props directly (unchanged)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./fetch_oddsapi_props"');
    expect(ro).not.toContain("fetch_oddsapi_legacy_alias");
  });

  it("compatibility shim fetch_oddsapi_odds.ts is re-export only (no logic)", () => {
    const shim = fs.readFileSync(path.join(root, "src", "fetch_oddsapi_odds.ts"), "utf8");
    expect(shim).toContain("fetch_oddsapi_legacy_alias");
    expect(shim).toMatch(
      /export \{ DEFAULT_MARKETS, fetchSgoPlayerPropOdds \} from ["']\.\/fetch_oddsapi_legacy_alias["']/
    );
    expect(shim).not.toContain("fetchOddsAPIProps");
    expect(shim).not.toContain("function fetchSgoPlayerPropOdds");
  });

  it("canonical module preserves OddsAPI wiring (behavior-neutral structural check)", () => {
    const canonical = fs.readFileSync(path.join(root, "src", "fetch_oddsapi_legacy_alias.ts"), "utf8");
    expect(canonical).toContain('import { fetchOddsAPIProps, DEFAULT_MARKETS } from "./fetch_oddsapi_props"');
    expect(canonical).toContain("export async function fetchSgoPlayerPropOdds");
    expect(canonical).toContain('sport: "basketball_nba"');
    expect(canonical).toContain("return fetchOddsAPIProps({");
    expect(canonical).not.toContain("axios");
  });

  it("repo hygiene: fetch_oddsapi_legacy_alias + shim are keep_active; rename deferral removed from skipped list", () => {
    const cands = getRepoHygieneAuditCandidates();
    const legacy = cands.find((c) => c.candidatePath === "src/fetch_oddsapi_legacy_alias.ts");
    const shim = cands.find((c) => c.candidatePath === "src/fetch_oddsapi_odds.ts");
    expect(legacy?.classification).toBe("keep_active");
    expect(shim?.classification).toBe("keep_active");
    expect(shim?.canonicalOwnerOrReplacement).toContain("fetch_oddsapi_legacy_alias");
    for (const line of PHASE17V_SKIPPED_NEEDS_REVIEW) {
      expect(line).not.toMatch(/fetch_oddsapi_odds.*deferred/i);
    }
  });

  it("PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY is stable (deterministic hygiene note)", () => {
    expect(PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY.length).toBe(1);
    expect(PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY[0]).toContain("fetch_oddsapi_legacy_alias");
  });

  it("buildRepoHygieneAuditReport default skippedNeedsReview matches PHASE17V_SKIPPED_NEEDS_REVIEW (17W subset)", () => {
    const rep = buildRepoHygieneAuditReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: null,
      safeRemovalsPerformed: [],
      skippedNeedsReview: [...PHASE17V_SKIPPED_NEEDS_REVIEW],
    });
    expect(rep.skippedNeedsReview).toEqual(
      [...PHASE17V_SKIPPED_NEEDS_REVIEW].sort((a, b) => a.localeCompare(b))
    );
  });

  it("regression: Phase 17T runtime contract stage count unchanged (>=10)", () => {
    expect(getSiteInvariantRuntimeContractStages().length).toBeGreaterThanOrEqual(10);
  });
});
