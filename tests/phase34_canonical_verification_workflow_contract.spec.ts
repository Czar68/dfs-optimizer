/**
 * Phase 34 — CI workflow still runs the same npm script as package.json verify:canonical.
 */
import fs from "fs";
import path from "path";

/** Canonical umbrella script invoked by `.github/workflows/main.yml` verify job (Phase 26+). */
const CANONICAL_VERIFY_SCRIPT = "verify:canonical";

type PackageJson = {
  scripts?: Record<string, string>;
};

describe("Phase 34 canonical verification workflow contract", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as PackageJson;
  const scripts = pkg.scripts ?? {};
  const workflow = fs.readFileSync(path.join(process.cwd(), ".github", "workflows", "main.yml"), "utf8");

  it("package.json defines the canonical verification script", () => {
    expect(scripts[CANONICAL_VERIFY_SCRIPT]).toBeDefined();
    expect(String(scripts[CANONICAL_VERIFY_SCRIPT]).length).toBeGreaterThan(0);
  });

  it("main.yml verify job runs npm run verify:canonical", () => {
    const runLine = `run: npm run ${CANONICAL_VERIFY_SCRIPT}`;
    expect(workflow).toContain(runLine);
  });
});
