// Bankroll CLI: ensure --bankroll and --bankroll=VALUE are applied; no 10000 fallback.

describe("CLI bankroll", () => {
  const origArgv = process.argv.slice();

  afterEach(() => {
    process.argv = origArgv.slice();
  });

  it("parses --bankroll 600", () => {
    process.argv = [process.argv[0], "run_optimizer.js", "--bankroll", "600"];
    const { parseArgs } = require("../cli_args");
    const result = parseArgs();
    expect(result.bankroll).toBe(600);
  });

  it("parses --bankroll=600", () => {
    process.argv = [process.argv[0], "run_optimizer.js", "--bankroll=600"];
    const { parseArgs } = require("../cli_args");
    const result = parseArgs();
    expect(result.bankroll).toBe(600);
  });

  it("defaults to 1000 when no --bankroll", () => {
    process.argv = [process.argv[0], "run_optimizer.js"];
    const { parseArgs } = require("../cli_args");
    const result = parseArgs();
    expect(result.bankroll).toBe(1000);
  });
});
