import fs from "fs";
import os from "os";
import path from "path";
import type { CardEvResult } from "../src/types";
import { buildRunStatus, formatRunStatusMarkdown, writeRunStatusArtifacts } from "../src/reporting/run_status";

function minimalCard(overrides: Partial<CardEvResult> & { site?: string }): CardEvResult {
  const pick = {
    id: "leg1",
    player: "A",
    stat: "pts",
    line: 20,
    sport: "NBA" as const,
    site: (overrides as { site?: string }).site === "underdog" ? ("underdog" as const) : ("prizepicks" as const),
  } as unknown as CardEvResult["legs"][0]["pick"];
  return {
    flexType: "5F",
    legs: [{ pick, side: "over" as const }],
    stake: 1,
    totalReturn: 2,
    expectedValue: 0.1,
    winProbability: 0.5,
    cardEv: 0.1,
    winProbCash: 0.4,
    winProbAny: 0.5,
    avgProb: 0.55,
    avgEdgePct: 5,
    hitDistribution: {} as CardEvResult["hitDistribution"],
    site: (overrides as { site?: string }).site === "underdog" ? "underdog" : "prizepicks",
    ...overrides,
  } as CardEvResult;
}

describe("Phase 17F run status", () => {
  it("buildRunStatus returns deterministic normalized JSON from representative input", () => {
    const pp = minimalCard({ cardEv: 0.12, avgEdgePct: 6, winProbCash: 0.45 });
    const ud = minimalCard({ site: "underdog", cardEv: 0.11, avgEdgePct: 5, winProbCash: 0.42 });
    const input = {
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "2026-03-20T08:00:00-04:00",
      success: true,
      ppCards: [pp],
      ppPicksCount: 42,
      udCards: [ud],
      udPicksCount: 30,
      digest: { generated: true, shownCount: 3, dedupedCount: 8 },
      artifacts: {
        prizepicksCardsCsvPath: "prizepicks-cards.csv",
        underdogCardsCsvPath: "underdog-cards.csv",
        prizepicksPicksCsvPath: "prizepicks-legs.csv",
        underdogPicksCsvPath: "underdog-legs.csv",
        telegramDigestPath: null,
      },
      notes: ["b", "a"],
    };
    const a = buildRunStatus({
      ...input,
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
    });
    const b = buildRunStatus({
      ...input,
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
    });
    expect(a).toEqual(b);
    expect(a.outcome).toBe("full_success");
    expect(a.runHealth).toBe("success");
    expect(a.earlyExitReason).toBeNull();
    expect(a.fatalReason).toBeNull();
    expect(a.notes).toEqual(["a", "b"]);
    expect(a.prizepicks).toEqual({
      picksCount: 42,
      cardsCount: 1,
      tier1Count: expect.any(Number),
      tier2Count: expect.any(Number),
    });
    expect(a.underdog.cardsCount).toBe(1);
    expect(a.digest).toEqual({ generated: true, shownCount: 3, dedupedCount: 8 });
    expect(a.artifacts.telegramDigestPath).toBeNull();
  });

  it("formatRunStatusMarkdown includes required sections in fixed line order (no notes)", () => {
    const s = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      success: false,
      runHealth: "success",
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    const md = formatRunStatusMarkdown(s);
    const lines = md.split("\n");
    expect(lines[0]).toBe("# DFS Optimizer Run Status");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("- **Generated (UTC):** 2026-03-20T12:00:00.000Z");
    expect(lines[3]).toBe("- **Run timestamp:** null");
    expect(lines[4]).toBe("- **Success:** false");
    expect(lines[5]).toBe("- **Outcome:** full_success");
    expect(lines[6]).toBe("- **Run health:** success");
    expect(lines[7]).toBe("");
    expect(lines[8]).toMatch(/^- \*\*PrizePicks:\*\* picks=null cards=/);
    expect(lines[9]).toMatch(/^- \*\*Underdog:\*\* picks=null cards=/);
    expect(lines[10]).toMatch(/^- \*\*Digest:\*\* generated=false shown=null/);
    expect(lines[11]).toBe("");
    expect(lines[12]).toBe("**Artifacts**");
    expect(lines[13]).toBe("- prizepicks cards: null");
    expect(lines[14]).toBe("- underdog cards: null");
    expect(lines[15]).toBe("- prizepicks picks: null");
    expect(lines[16]).toBe("- underdog picks: null");
    expect(lines[17]).toBe("- telegram digest file: null");
    expect(md).not.toContain("**Notes**");
  });

  it("formatRunStatusMarkdown appends Notes after Artifacts when notes exist", () => {
    const s = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "x",
      success: true,
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
      ppCards: [],
      ppPicksCount: 0,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: ["zeta", "alpha"],
    });
    const md = formatRunStatusMarkdown(s);
    const lines = md.split("\n");
    const idxNotes = lines.indexOf("**Notes**");
    expect(idxNotes).toBeGreaterThan(lines.indexOf("**Artifacts**"));
    expect(lines[idxNotes + 1]).toBe("- alpha");
    expect(lines[idxNotes + 2]).toBe("- zeta");
  });

  it("missing optional paths/counts use null and notes; builder does not throw", () => {
    expect(() =>
      buildRunStatus({
        generatedAtUtc: "2026-03-20T12:00:00.000Z",
        runTimestamp: null,
        success: true,
        outcome: "full_success",
        earlyExitReason: null,
        fatalReason: null,
        ppCards: [],
        ppPicksCount: null,
        udCards: [],
        udPicksCount: null,
        digest: { generated: false, shownCount: null, dedupedCount: null },
        artifacts: {
          prizepicksCardsCsvPath: null,
          underdogCardsCsvPath: null,
          prizepicksPicksCsvPath: null,
          underdogPicksCsvPath: null,
          telegramDigestPath: null,
        },
        notes: ["Optional artifact X not produced"],
      })
    ).not.toThrow();
    const s = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      success: true,
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: ["note-a"],
    });
    expect(s.prizepicks.picksCount).toBeNull();
    expect(s.digest.shownCount).toBeNull();
    expect(s.artifacts.telegramDigestPath).toBeNull();
  });

  it("writeRunStatusArtifacts writes JSON and markdown to requested paths", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs17f-"));
    const status = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "t",
      success: true,
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
      ppCards: [],
      ppPicksCount: 0,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    const sub = "out/status";
    const { jsonPath, mdPath } = writeRunStatusArtifacts(tmp, status, {
      jsonRel: path.join(sub, "x.json"),
      mdRel: path.join(sub, "y.md"),
    });
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
      success: boolean;
      outcome: string;
      runHealth: string;
      fatalReason: string | null;
    };
    expect(j.success).toBe(true);
    expect(j.outcome).toBe("full_success");
    expect(j.runHealth).toBe("success");
    expect(j.fatalReason).toBeNull();
    expect(fs.readFileSync(mdPath, "utf8")).toContain("# DFS Optimizer Run Status");
  });

  it("run_optimizer completion path invokes run status writer (static wiring check)", () => {
    const p = path.join(__dirname, "../src/run_optimizer.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("finalizeCanonicalRunStatus");
    expect(src).toContain("Phase 17F");
  });
});
