/**
 * Phase 19A — Root `.env.example` contract (aligned with tests/e2e.spec.ts).
 * Phase 19B — Root vs `config/.env.example` mirror parity (assignment lines only; headers may differ).
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * Non-comment, non-empty lines that look like `KEY=value`.
 * Order preserved — root and config must match this sequence (anti-drift).
 */
function extractEnvAssignmentLines(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) {
      throw new Error(`Invalid non-comment line in .env.example (expected KEY=value): ${line}`);
    }
    out.push(`${m[1]}=${m[2]}`);
  }
  return out;
}

describe("Phase 19A — .env.example contract", () => {
  it("root .env.example exists and documents Telegram keys (e2e contract)", () => {
    const envPath = path.join(root, ".env.example");
    expect(fs.existsSync(envPath)).toBe(true);
    const content = read(".env.example");
    expect(content).toContain("TELEGRAM_BOT_TOKEN");
    expect(content).toContain("TELEGRAM_CHAT_ID");
    expect(content).toContain("ODDSAPI_KEY");
  });

  it("config/.env.example mirrors root markers (no ambiguity on Telegram / OddsAPI)", () => {
    const configPath = path.join(root, "config", ".env.example");
    expect(fs.existsSync(configPath)).toBe(true);
    const c = read("config/.env.example");
    expect(c).toContain("TELEGRAM_BOT_TOKEN");
    expect(c).toContain("TELEGRAM_CHAT_ID");
    expect(c).toContain("ODDSAPI_KEY");
  });
});

describe("Phase 19B — root vs config/.env.example mirror parity", () => {
  it("assignment lines (KEY=value) match in order; headers/comments may differ", () => {
    const rootLines = extractEnvAssignmentLines(read(".env.example"));
    const configLines = extractEnvAssignmentLines(read("config/.env.example"));
    expect(configLines).toEqual(rootLines);
  });
});
