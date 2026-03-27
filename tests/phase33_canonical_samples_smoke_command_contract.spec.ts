/**
 * Phase 33 — package.json contract: canonical samples UI smoke script + inclusion in verify:canonical.
 */
import fs from "fs";
import path from "path";

type PackageJson = {
  scripts?: Record<string, string>;
};

function readRootPackageJson(): PackageJson {
  const p = path.join(process.cwd(), "package.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as PackageJson;
}

describe("Phase 33 canonical samples smoke command contract", () => {
  const pkg = readRootPackageJson();
  const scripts = pkg.scripts ?? {};

  it("exposes verify:canonical-samples:ui-smoke that runs Playwright", () => {
    const smoke = scripts["verify:canonical-samples:ui-smoke"];
    expect(smoke).toBeDefined();
    expect(smoke!.toLowerCase()).toContain("playwright");
    expect(smoke).toMatch(/playwright\s+test/);
  });

  it("chains verify:canonical-samples:ui-smoke after Jest in verify:canonical", () => {
    const canonical = scripts["verify:canonical"];
    expect(canonical).toBeDefined();
    expect(canonical).toContain("npm run verify:canonical-samples:ui-smoke");
  });
});
