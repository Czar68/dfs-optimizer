/**
 * Phase 18D — pp_engine: createPrizepicksEngine requires explicit CliArgs; no getCliArgs in module.
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function readPp(): string {
  return fs.readFileSync(path.join(root, "src", "pp_engine.ts"), "utf8");
}

describe("Phase 18D — PrizePicks engine explicit CliArgs", () => {
  it("pp_engine does not import getCliArgs or export implicit singleton", () => {
    const pp = readPp();
    expect(pp).not.toContain("getCliArgs");
    expect(pp).not.toContain("export const ppEngine");
    expect(pp).toMatch(/export function createPrizepicksEngine\(\s*cli:\s*CliArgs\s*\)/);
    expect(pp).toContain("return new PrizepicksEngine(cli)");
  });

  it("run_optimizer passes args into createPrizepicksEngine", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain("createPrizepicksEngine(args)");
  });
});
