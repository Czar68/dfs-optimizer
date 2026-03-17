/**
 * MSW request handlers for API-calling services.
 * Payloads match existing cache/API schema so normalized output matches production.
 *
 * CardBuilder (src/services/cardBuilder.ts): No additional handlers required for
 * unit testing. CardBuilder.buildCardsFromMergedProps uses evaluateFlexCard →
 * getStructureEV; when ENGINE_MODE !== 'sheets', the engine uses local
 * computeLocalStructureEVs (no HTTP). Tests in tests/card_builder.spec.ts
 * cover mapping, gameTime, and CSV export without mocking these.
 */

import { http, HttpResponse } from "msw";

const BASE_URL = "https://api.the-odds-api.com/v4";

/** Events list response (markets=h2h): array of events with id and commence_time. */
const eventsListPayload = [
  { id: "ev_mock_1", commence_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), home_team: "LAL", away_team: "BOS" },
  { id: "ev_mock_2", commence_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), home_team: "MIA", away_team: "PHI" },
];

/** Single event odds response: bookmakers with player_* markets (player_points → points). */
function eventOddsPayload(eventId: string) {
  return {
    id: eventId,
    commence_time: new Date().toISOString(),
    home_team: "LAL",
    away_team: "BOS",
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        markets: [
          {
            key: "player_points",
            outcomes: [
              { name: "Over", description: "LeBron James", point: 24.5, price: -110 },
              { name: "Under", description: "LeBron James", point: 24.5, price: -110 },
            ],
          },
          {
            key: "player_rebounds",
            outcomes: [
              { name: "Over", description: "LeBron James", point: 7.5, price: -115 },
              { name: "Under", description: "LeBron James", point: 7.5, price: -105 },
            ],
          },
        ],
      },
    ],
  };
}

/** Quota headers for Odds API (fetchOddsAPIProps logs these). */
const quotaHeaders = {
  "x-requests-used": "42",
  "x-requests-remaining": "17958",
  "x-requests-last": "1",
};

/** Handlers for The Odds API (fetchOddsAPIProps). */
export const oddsApiHandlers = [
  // GET /sports/:sport/events/ (events list; no regions/markets on this endpoint)
  http.get(`${BASE_URL}/sports/basketball_nba/events/`, () => {
    return HttpResponse.json(eventsListPayload, { headers: quotaHeaders });
  }),

  // GET /sports/:sport/events/:eventId/odds/ (event-level player props)
  http.get(`${BASE_URL}/sports/basketball_nba/events/:eventId/odds/`, ({ params }) => {
    const eventId = params.eventId as string;
    return HttpResponse.json(eventOddsPayload(eventId), { headers: quotaHeaders });
  }),
];

/** Handler that returns 401 Unauthorized (for fail-fast tests). */
export const oddsApiUnauthorizedHandler = http.get(
  `${BASE_URL}/sports/basketball_nba/events/`,
  () => new HttpResponse(null, { status: 401 })
);

/** Handler that returns 500 Server Error (for fail-fast tests). */
export const oddsApiServerErrorHandler = http.get(
  `${BASE_URL}/sports/basketball_nba/events/`,
  () => new HttpResponse(JSON.stringify({ message: "Internal Server Error" }), { status: 500 })
);

export const handlers = [...oddsApiHandlers];
