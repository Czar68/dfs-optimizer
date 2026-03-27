/**
 * Phase 17Z — Remove process-global cliArgs from runtime-adjacent helpers
 * (card_ev, build_innovative_cards, telegram_pusher) + explicit threading from run_optimizer.
 */
import fs from "fs";
import path from "path";

import { getDefaultCliArgs, parseArgs } from "../src/cli_args";
import { buildInnovativeCards } from "../src/build_innovative_cards";
import { createSyntheticEvPicks } from "../src/mock_legs";

const root = path.join(__dirname, "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase 17Z — explicit CliArgs in runtime helpers", () => {
  it("card_ev / build_innovative_cards / telegram_pusher: no process-global cliArgs import", () => {
    expect(readSrc("src/card_ev.ts")).not.toMatch(/\bcliArgs\b/);
    expect(readSrc("src/build_innovative_cards.ts")).not.toMatch(/\bcliArgs\b/);
    expect(readSrc("src/telegram_pusher.ts")).not.toMatch(/\bcliArgs\b/);
  });

  it("run_optimizer threads explicit args into evaluateFlexCard + innovative + telegram dry-run", () => {
    const ro = readSrc("src/run_optimizer.ts");
    expect(ro).toMatch(/evaluateFlexCard\([\s\S]*minCardEvFallback/);
    expect(ro).toContain("buildInnovativeCards(sortedLegs,");
    expect(ro).toContain("cli: args");
    expect(ro).toContain("telegramDryRun: args.telegramDryRun");
    expect(ro).toMatch(/pushUdTop5FromCsv\([\s\S]*?args\.telegramDryRun/);
  });

  it("buildInnovativeCards: omitting cli matches explicit getDefaultCliArgs() (no hidden global for defaults)", () => {
    const legs = createSyntheticEvPicks(12, "prizepicks");
    const omit = buildInnovativeCards(legs, { bankroll: 1000, maxCards: 10 });
    const explicit = buildInnovativeCards(legs, {
      bankroll: 1000,
      maxCards: 10,
      cli: getDefaultCliArgs(),
    });
    expect(omit.cards.length).toBe(explicit.cards.length);
    expect(omit.cards.map((c) => c.cardEV)).toEqual(explicit.cards.map((c) => c.cardEV));
  });

  it("buildInnovativeCards: explicit volume CliArgs changes portfolio vs default (opts.cli path)", () => {
    const legs = createSyntheticEvPicks(12, "prizepicks");
    const def = buildInnovativeCards(legs, {
      bankroll: 1000,
      maxCards: 10,
      cli: getDefaultCliArgs(),
    });
    const vol = buildInnovativeCards(legs, {
      bankroll: 1000,
      maxCards: 10,
      cli: parseArgs(["--volume"]),
    });
    expect(parseArgs(["--volume"]).volume).toBe(true);
    expect(vol.cards.length).not.toBe(def.cards.length);
  });
});
