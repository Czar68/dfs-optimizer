/**
 * fetchOddsAPIProps with MSW: intercept network, realistic payloads, and fail-fast (401/500).
 */

import { fetchOddsAPIProps } from "../src/fetch_oddsapi_props";
import { server } from "../src/mocks/server";
import { oddsApiUnauthorizedHandler, oddsApiServerErrorHandler } from "../src/mocks/handlers";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const testApiKey = "test-key-for-msw";

describe("fetchOddsAPIProps", () => {
  it("returns normalized props when API responds with events and event odds", async () => {
    const result = await fetchOddsAPIProps({
      apiKey: testApiKey,
      sport: "basketball_nba",
      forceRefresh: true,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const first = result[0];
    expect(first).toHaveProperty("player");
    expect(first).toHaveProperty("stat");
    expect(first).toHaveProperty("line");
    expect(first).toHaveProperty("overOdds");
    expect(first).toHaveProperty("underOdds");
    expect(first).toHaveProperty("book");
    expect(first.sport).toBe("NBA");
  });

  it("handles 401 Unauthorized gracefully without crashing (fail-fast)", async () => {
    server.use(oddsApiUnauthorizedHandler);
    const result = await fetchOddsAPIProps({
      apiKey: testApiKey,
      forceRefresh: true,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("handles 500 Server Error gracefully without crashing (fail-fast)", async () => {
    server.use(oddsApiServerErrorHandler);
    const result = await fetchOddsAPIProps({
      apiKey: testApiKey,
      forceRefresh: true,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});
