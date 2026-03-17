/**
 * Mock-run guard: tag runTimestamp with "MOCK-" when synthetic legs are used,
 * and warn when a valid ODDSAPI_KEY is present so mock is unmistakable in logs.
 */

const MOCK_WARNING_MSG =
  "[MOCK WARNING] USE_MOCK_ODDS or --mock-legs is active but a valid ODDSAPI_KEY is present. This run will use SYNTHETIC legs, not live data. Set USE_MOCK_ODDS=0 or remove --mock-legs for a live run.";

export function applyMockRunTimestamp(
  runTimestamp: string,
  effectiveMockLegs: number | null,
  env: NodeJS.ProcessEnv
): string {
  if (effectiveMockLegs == null || effectiveMockLegs <= 0) return runTimestamp;
  const key = (env.ODDSAPI_KEY ?? env.ODDS_API_KEY ?? "").trim();
  if (key.length >= 8) {
    console.warn(MOCK_WARNING_MSG);
  }
  return "MOCK-" + runTimestamp;
}

export { MOCK_WARNING_MSG };
