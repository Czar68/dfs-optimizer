/**
 * Phase 18C — ud_engine: createUnderdogEngine requires explicit CliArgs; no getCliArgs in module.
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function readUd(): string {
  return fs.readFileSync(path.join(root, "src", "ud_engine.ts"), "utf8");
}

describe("Phase 18C — Underdog engine explicit CliArgs", () => {
  it("ud_engine does not import getCliArgs or instantiate via global fallback", () => {
    const ud = readUd();
    expect(ud).not.toContain("getCliArgs");
    expect(ud).not.toContain("export const udEngine");
    expect(ud).toMatch(/export function createUnderdogEngine\(\s*cli:\s*CliArgs\s*\)/);
    expect(ud).toContain("return new UnderdogEngine(cli)");
  });
});
