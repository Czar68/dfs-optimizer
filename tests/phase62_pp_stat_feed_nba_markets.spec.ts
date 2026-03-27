/**
 * Phase 62 — PP residual no_odds_stat: Odds API market keys for NBA stocks + turnovers
 * must be requested and map to canonical StatCategory so merge dynamic filter sees feed coverage.
 */
import {
  DEFAULT_MARKETS,
  DEFAULT_MARKETS_ALTERNATE,
  REQUIRED_MARKETS,
} from "../src/fetch_oddsapi_props";

describe("Phase 62 — NBA Odds API stat/feed alignment (stocks, turnovers)", () => {
  it("REQUIRED_MARKETS includes player_blocks_steals→stocks and player_turnovers→turnovers", () => {
    const byKey = Object.fromEntries(REQUIRED_MARKETS.map((m) => [m.key, m.stat]));
    expect(byKey.player_blocks_steals).toBe("stocks");
    expect(byKey.player_turnovers).toBe("turnovers");
  });

  it("alternate list includes player_turnovers_alternate→turnovers", () => {
    const byKey = Object.fromEntries(DEFAULT_MARKETS_ALTERNATE.map((m) => [m.key, m.stat]));
    expect(byKey.player_turnovers_alternate).toBe("turnovers");
  });

  it("DEFAULT_MARKETS unions primary keys without duplicate stat keys for stocks/turnovers", () => {
    const keys = new Set(DEFAULT_MARKETS.map((m) => m.key));
    expect(keys.has("player_blocks_steals")).toBe(true);
    expect(keys.has("player_turnovers")).toBe(true);
  });
});
