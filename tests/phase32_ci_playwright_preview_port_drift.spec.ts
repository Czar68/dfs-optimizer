/**
 * Phase 32 — CI workflow PLAYWRIGHT_PREVIEW_PORT must match DEFAULT_PLAYWRIGHT_PREVIEW_PORT (playwright.preview.port.ts).
 */
import fs from "fs";
import path from "path";
import { DEFAULT_PLAYWRIGHT_PREVIEW_PORT } from "../playwright.preview.port";

describe("Phase 32 CI / Playwright preview port alignment", () => {
  it("main.yml sets PLAYWRIGHT_PREVIEW_PORT to the same value as DEFAULT_PLAYWRIGHT_PREVIEW_PORT", () => {
    const wf = path.join(process.cwd(), ".github", "workflows", "main.yml");
    const content = fs.readFileSync(wf, "utf8");
    const port = String(DEFAULT_PLAYWRIGHT_PREVIEW_PORT);
    expect(content).toContain(`PLAYWRIGHT_PREVIEW_PORT: "${port}"`);
  });
});
