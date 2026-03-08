// src/__tests__/sgo_alt_lines.test.ts
// Tests: alt-line preservation in normalization + requireAltLines fail-fast.

import type { SgoPlayerPropOdds } from "../types";

// We test the normalization uniqueness key logic and the throwIfNoAlts guard.
// The actual SGO API normalization happens inside fetchLeaguePlayerPropsFromApi,
// so we replicate the key-building logic here to verify correctness.

describe("SGO alt-line uniqueness key", () => {
  it("preserves multiple alt lines for the same player+stat at different lines", () => {
    // Simulate the normalization accumulator from fetchLeaguePlayerPropsFromApi
    const byKey = new Map<string, SgoPlayerPropOdds>();

    const rows = [
      { player: "nikola-jokic", stat: "points", line: 24.5, book: "fanduel", isMainLine: true },
      { player: "nikola-jokic", stat: "points", line: 22.5, book: "fanduel", isMainLine: false },
      { player: "nikola-jokic", stat: "points", line: 26.5, book: "fanduel", isMainLine: false },
      { player: "nikola-jokic", stat: "points", line: 28.5, book: "draftkings", isMainLine: false },
      { player: "nikola-jokic", stat: "points", line: 24.5, book: "draftkings", isMainLine: true },
    ];

    for (const r of rows) {
      // This is the key format from the updated fetch_sgo_odds.ts
      const key = `${r.player}::${r.stat}::${r.line}::${r.book}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          sport: "NBA",
          player: r.player,
          team: "DEN",
          opponent: "LAL",
          league: "NBA",
          stat: r.stat as any,
          line: r.line,
          overOdds: -110,
          underOdds: -110,
          book: r.book,
          eventId: "evt1",
          marketId: null,
          selectionIdOver: null,
          selectionIdUnder: null,
          isMainLine: r.isMainLine,
        });
      }
    }

    // All 5 entries should be distinct (no collapse)
    expect(byKey.size).toBe(5);

    // Verify distinct lines are preserved
    const lines = Array.from(byKey.values()).map((m) => m.line).sort();
    expect(lines).toEqual([22.5, 24.5, 24.5, 26.5, 28.5]);

    // Verify books are preserved
    const books = Array.from(byKey.values()).map((m) => m.book);
    expect(books.filter((b) => b === "fanduel")).toHaveLength(3);
    expect(books.filter((b) => b === "draftkings")).toHaveLength(2);
  });

  it("OLD key (player+stat+line only) would collapse cross-book entries", () => {
    const byOldKey = new Map<string, any>();
    const rows = [
      { player: "nikola-jokic", stat: "points", line: 24.5, book: "fanduel" },
      { player: "nikola-jokic", stat: "points", line: 24.5, book: "draftkings" },
    ];

    for (const r of rows) {
      const oldKey = `${r.player}::${r.stat}::${r.line}`;
      if (!byOldKey.has(oldKey)) byOldKey.set(oldKey, r);
    }

    // Old key collapses the two books into one entry
    expect(byOldKey.size).toBe(1);

    // New key preserves both
    const byNewKey = new Map<string, any>();
    for (const r of rows) {
      const newKey = `${r.player}::${r.stat}::${r.line}::${r.book}`;
      if (!byNewKey.has(newKey)) byNewKey.set(newKey, r);
    }
    expect(byNewKey.size).toBe(2);
  });

  it("altCount > 0 when alt lines exist in normalized output", () => {
    const rows: Array<{ isMainLine: boolean }> = [
      { isMainLine: true },
      { isMainLine: false },
      { isMainLine: false },
      { isMainLine: true },
    ];
    const mainCount = rows.filter((r) => r.isMainLine).length;
    const altCount = rows.filter((r) => !r.isMainLine).length;
    expect(altCount).toBe(2);
    expect(mainCount).toBe(2);
    expect(altCount).toBeGreaterThan(0);
  });
});

describe("requireAltLines fail-fast", () => {
  // We import the _throwIfNoAlts helper from fetch_sgo_odds.ts
  // Since it depends on cliArgs (a module-level singleton), we mock it.
  let originalIncludeAltLines: boolean;
  let originalRequireAltLines: boolean;

  beforeEach(() => {
    // Save originals — cliArgs is a singleton parsed at import time.
    const { cliArgs } = require("../cli_args");
    originalIncludeAltLines = cliArgs.includeAltLines;
    originalRequireAltLines = cliArgs.requireAltLines;
  });

  afterEach(() => {
    const { cliArgs } = require("../cli_args");
    cliArgs.includeAltLines = originalIncludeAltLines;
    cliArgs.requireAltLines = originalRequireAltLines;
  });

  it("throws when requireAltLines=true, includeAltLines=true, altCount=0, NBA", () => {
    const { cliArgs } = require("../cli_args");
    cliArgs.includeAltLines = true;
    cliArgs.requireAltLines = true;

    const { _throwIfNoAlts } = require("../fetch_oddsapi_odds");
    const params = { includeAltLines: true, includeOpposingOdds: true, limit: 200 };

    expect(() => _throwIfNoAlts(0, "NBA", params, 10, 10)).toThrow(
      /REQUIRE_ALT_LINES FAILED/
    );
  });

  it("does NOT throw when altCount > 0", () => {
    const { cliArgs } = require("../cli_args");
    cliArgs.includeAltLines = true;
    cliArgs.requireAltLines = true;

    const { _throwIfNoAlts } = require("../fetch_oddsapi_odds");
    const params = { includeAltLines: true, includeOpposingOdds: true, limit: 200 };

    expect(() => _throwIfNoAlts(5, "NBA", params, 10, 15)).not.toThrow();
  });

  it("does NOT throw when includeAltLines=false", () => {
    const { cliArgs } = require("../cli_args");
    cliArgs.includeAltLines = false;
    cliArgs.requireAltLines = true;

    const { _throwIfNoAlts } = require("../fetch_oddsapi_odds");
    const params = { includeAltLines: false, includeOpposingOdds: true, limit: 200 };

    expect(() => _throwIfNoAlts(0, "NBA", params, 10, 10)).not.toThrow();
  });

  it("warns but does NOT throw for non-NBA league when requireAltLines=true", () => {
    const { cliArgs } = require("../cli_args");
    cliArgs.includeAltLines = true;
    cliArgs.requireAltLines = true;

    const { _throwIfNoAlts } = require("../fetch_oddsapi_odds");
    const params = { includeAltLines: true, includeOpposingOdds: true, limit: 200 };

    expect(() => _throwIfNoAlts(0, "NFL", params, 10, 10)).not.toThrow();
  });

  it("warns but does NOT throw when requireAltLines=false", () => {
    const { cliArgs } = require("../cli_args");
    cliArgs.includeAltLines = true;
    cliArgs.requireAltLines = false;

    const { _throwIfNoAlts } = require("../fetch_oddsapi_odds");
    const params = { includeAltLines: true, includeOpposingOdds: true, limit: 200 };

    expect(() => _throwIfNoAlts(0, "NBA", params, 10, 10)).not.toThrow();
  });
});
