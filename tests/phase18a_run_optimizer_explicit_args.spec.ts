/**
 * Phase 18A — run_optimizer orchestration uses resolved `args` only (no cliArgs Proxy import).
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function readRo(): string {
  return fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
}

describe("Phase 18A — run_optimizer explicit args orchestration", () => {
  it("does not import or reference global cliArgs identifier (orchestration uses const args)", () => {
    const ro = readRo();
    expect(ro).not.toMatch(/\bcliArgs\b/);
    expect(ro).toContain('import { getCliArgs, type CliArgs } from "./cli_args"');
    expect(ro).toContain("const args = getCliArgs()");
  });

  it("runSheetsPush takes explicit CliArgs and callers pass args", () => {
    const ro = readRo();
    expect(ro).toContain("function runSheetsPush(runTimestamp: string, cli: CliArgs): number");
    expect(ro).toContain("runSheetsPush(ts, args)");
    expect(ro).toContain("runSheetsPush(runTimestamp, args)");
  });
});
