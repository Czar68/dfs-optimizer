/**
 * E2E and Telegram wire tests.
 * - Telegram: no-env skip behavior, missing CSV skip
 * - Prod script and CLI wiring for --platform both --telegram
 */
import * as fs from "fs";
import * as path from "path";

describe("Telegram wire", () => {
  it("testTelegramConnection returns false when TELEGRAM credentials unset", async () => {
    const origToken = process.env.TELEGRAM_BOT_TOKEN;
    const origChat = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    try {
      const { testTelegramConnection } = require("../src/telegram_pusher");
      const ok = await testTelegramConnection();
      expect(ok).toBe(false);
    } finally {
      if (origToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = origToken;
      if (origChat !== undefined) process.env.TELEGRAM_CHAT_ID = origChat;
    }
  });

  it("pushUdTop5FromCsv does not throw when CSV path missing", async () => {
    const { pushUdTop5FromCsv } = require("../src/telegram_pusher");
    const badPath = path.join(process.cwd(), "nonexistent-ud-cards.csv");
    await expect(pushUdTop5FromCsv(badPath, "2026-02-22", 600)).resolves.toBeUndefined();
  });
});

describe("E2E prod script", () => {
  it("run-both.ps1 exists and contains platform both and bankroll 600", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "run-both.ps1");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("both");
    expect(content).toContain("600");
    expect(content).toContain("telegram");
  });
});

describe("E2E both + telegram wiring in run_optimizer", () => {
  it("run_optimizer imports pushUdTop5FromCsv and wires telegram in both flow", () => {
    const runPath = path.join(process.cwd(), "src", "run_optimizer.ts");
    const content = fs.readFileSync(runPath, "utf8");
    expect(content).toContain("pushUdTop5FromCsv");
    expect(content).toContain("underdog-cards.csv");
    expect(content).toContain("cliArgs.telegram");
    expect(content).toContain('"both"');
  });
});

describe("CLI daily and export-uncap", () => {
  it("cli_args CliArgs interface has daily and exportUncap", () => {
    const cliPath = path.join(process.cwd(), "src", "cli_args.ts");
    const content = fs.readFileSync(cliPath, "utf8");
    expect(content).toContain("daily: boolean");
    expect(content).toContain("exportUncap: boolean");
    expect(content).toContain("--daily");
    expect(content).toContain("--export-uncap");
  });
});

describe("Env and daily driver", () => {
  it(".env.example exists and documents TELEGRAM_BOT_TOKEN", () => {
    const envPath = path.join(process.cwd(), ".env.example");
    expect(fs.existsSync(envPath)).toBe(true);
    const content = fs.readFileSync(envPath, "utf8");
    expect(content).toContain("TELEGRAM_BOT_TOKEN");
    expect(content).toContain("TELEGRAM_CHAT_ID");
  });

  it("daily-run.ps1 exists and invokes run-both", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "daily-run.ps1");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("run-both");
    expect(content).toContain("Fresh");
  });
});

describe("UD slate boost", () => {
  it("run_underdog_optimizer has auto boost when real slate <20 cards", () => {
    const udPath = path.join(process.cwd(), "src", "run_underdog_optimizer.ts");
    const content = fs.readFileSync(udPath, "utf8");
    expect(content).toContain("buildUdCardsFromFiltered");
    expect(content).toContain("Auto boost");
    expect(content).toContain("0.008");
  });
});
