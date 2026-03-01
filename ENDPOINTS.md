# TheRundown API v2 Endpoints Catalog

## Base URL
```
https://therundown.io/api/v2
```

## Authentication Headers
```
x-api-key: <API_KEY>
# OR
key: <API_KEY>
```

## Sport ID Mapping (Confirmed)
| Sport | ID | Code |
|-------|----|------|
| NCAAF | 1 | NCAAF |
| NFL | 2 | NFL |
| MLB | 3 | MLB |
| **NBA** | **4** | **NBA** |
| **NCAAB** | **5** | **NCAA Men's Basketball** |
| **NHL** | **6** | **NHL** |
| UFC/MMA | 7 | UFC/MMA |
| WNBA | 8 | WNBA |
| MLS | 10 | MLS |
| EPL | 11 | EPL |
| FRA1 | 12 | FRA1 |
| GER1 | 13 | GER1 |
| ESP1 | 14 | ESP1 |
| ITA1 | 15 | ITA1 |
| UEFA Champions | 16 | UEFACHAMP |
| UEFA Euro | 17 | UEFAEURO |
| FIFA World Cup | 18 | FIFA |
| JPN1 | 19 | JPN1 |
| IPL | 20 | IPL |
| T20 | 21 | T20 |
| Politics | 22 | Politics |
| NBA Preseason | 23 | NBA Preseason |
| NBA Playoffs | 24 | NBA Playoffs |
| NFL Preseason | 25 | NFL Preseason |
| NFL Playoffs | 26 | NFL Playoffs |
| NHL Preseason | 27 | NHL Preseason |
| NHL Playoffs | 28 | NHL Playoffs |
| MLB Preseason | 29 | MLB Preseason |
| MLB Spring Training | 30 | MLB Spring Training |
| MLB Playoffs | 31 | MLB Playoffs |
| NBA Summer League | 32 | NBA Summer League |
| UEFA Europa League | 33 | UEFA Europa League |

## V2 Endpoints Used in Codebase

### From `therundownProps.ts` (Multi-sport)
```typescript
// 1. Get events for sport
GET /sports/{sport_id}/events
// Example: GET /sports/4/events

// 2. Get odds for events  
GET /events/{event_ids}/odds
// Example: GET /events/123,456,789/odds
```

### From `therundownNbaProps.ts` (NBA-specific)
```typescript
// 3. Get NBA events for date
GET /sports/{sport_id}/events/{date}
// Example: GET /sports/4/events/2026-02-16
```

## Full V2 Endpoint Reference (From Docs)

### V2 Sports
- `GET /sports` - List all sports ✅ TESTED
- `GET /sports/available-dates` - Get available dates for multiple sports
- `GET /sports/events/{date}` - Get events across sports for a date
- `GET /sports/available-markets/{date}` - Get available markets by date
- `GET /sports/{sport_id}/teams` - Get teams for a sport
- `GET /sports/{sport_id}/available-dates` - Get available dates for a sport
- `GET /sports/{sport_id}/divisions` - Get divisions for a sport
- `GET /sports/{sport_id}/conferences` - Get conferences for a sport

### V2 Events
- `GET /sports/{sport_id}/events/{date}` - Get events with markets for sport and date ⚠️ 404
- `GET /events/{event_id}` - Get a single event with markets
- `GET /events/{event_id}/opening-prices` - Get opening prices for an event
- `GET /events/{event_id}/best-line` - Get best available line for an event
- `GET /events/delta/{delta_id}` - Get event changes since delta ID

### V2 Markets
- `GET /sports/{sport_id}/markets/{date}` - Get available markets for sport and date
- `GET /events/{event_id}/markets` - Get available markets for an event
- `GET /events/{event_id}/markets/history` - Get market price history for an event
- `GET /events/{event_id}/markets/opening` - Get opening prices for event's markets
- `GET /markets/{market_id}/chart` - Get line price chart data for specific market
- `GET /markets` - List all market definitions
- `GET /markets/delta/{delta_id}` - Get market price changes since ID
- `GET /markets/line-history` - Get price history for specific market line prices
- `GET /markets/{market_id}/participants` - Get market participants

### V2 Teams
- `GET /teams/{team_id}` - Get a team by ID
- `GET /teams/{team_id}/players` - Get players for a team
- `GET /teams/{team_id}/season-stats` - Get season stats for a team
- `GET /teams/{team_id}/player-season-stats` - Get player season stats for a team

### V2 Players
- `GET /players/{player_id}` - Get a player by ID

### V2 Stats
- `GET /events/{event_id}/stats/team` - Get team game stats for an event
- `GET /events/{event_id}/stats/player` - Get player game stats for an event
- `GET /stats/definitions` - List all stat definitions

### V2 Reference
- `GET /affiliates` - List all sportsbooks/affiliates
- `GET /sportsbooks` - List all sportsbooks (alias for /affiliates)
- `GET /sports/{sport_id}/season-types` - List season types per sport

### V2 WebSocket
- `GET /markets/websocket` - Stream real-time market price updates

## Rate Limits
- **Free Plan**: 20,000 data points per day
- **Current Usage**: 1,000/20,000 used (as of 2026-02-16)

## Issues Found

### 1. Authentication Issues
- **Problem**: `{"message":"unauthorized"}` for events endpoints
- **Status**: API key works for `/sports` but fails for `/sports/{sport_id}/events/{date}`
- **Possible Causes**:
  - Date format issue (2026-02-16 vs YYYY-MM-DD)
  - API key permissions (free tier limitations)
  - Endpoint requires different auth method

### 2. 404 Issues  
- **Problem**: `404 page not found` for `/sports/4/events` (no date)
- **Expected**: Date parameter required for events endpoints

## Debugging Needed
1. Verify correct date format for events endpoints
2. Check API key permissions for player props data
3. Test with different dates (today vs upcoming games)
4. Confirm if player props require higher tier plan

## Next Steps
1. Add 404 debug logging to codebase
2. Test with different date formats
3. Run NBA live test with debug logging
4. Contact TheRundown support if auth issues persist
