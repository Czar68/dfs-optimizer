/**
 * Phase 18B — run_underdog_optimizer: one resolved args snapshot; no getCliArgs in engine helper.
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function readUd(): string {
  return fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
}

describe("Phase 18B — run_underdog_optimizer explicit args", () => {
  it("main resolves cli once via const args = cli ?? getCliArgs(); uses args for merge + filters", () => {
    const ud = readUd();
    expect(ud).toContain("const args = cli ?? getCliArgs()");
    expect(ud).toContain("mergeWithSnapshot(rawProps, existingSnapshot.rows, snapshotMeta, snapshotAudit, args)");
    expect(ud).toContain("mergeOddsWithPropsWithMetadata(rawProps, args)");
  });

  it("filterEvPicksForEngine requires explicit CliArgs (no getCliArgs fallback)", () => {
    const ud = readUd();
    expect(ud).toMatch(/export function filterEvPicksForEngine\(\s*evPicks:\s*EvPick\[\]\s*,\s*cli:\s*CliArgs\s*\)/);
    expect(ud).toContain("return filterEvPicks(evPicks, cli)");
    expect(ud).not.toMatch(/filterEvPicksForEngine[\s\S]*getCliArgs/);
  });

  it("only one getCliArgs() call site in module (main snapshot)", () => {
    const ud = readUd();
    const matches = ud.match(/\bgetCliArgs\s*\(/g);
    expect(matches?.length ?? 0).toBe(1);
  });
});
