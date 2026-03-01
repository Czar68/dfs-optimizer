// src/odds/sgo-quota.ts
// Log SGO quota once per run. No local cap — only SGO 429 enforces.

/** Real limits from your SGO account (dashboard); we never block on a local number. */
const SGO_DASHBOARD_REQUESTS_MAX = 500_000;
const SGO_DASHBOARD_ENTITIES_MAX = 3_000_000;

export interface SgoQuotaInfo {
  requestsUsed: number;
  requestsMax: number;
  entitiesUsed?: number;
  entitiesMax?: number;
}

/**
 * Log SGO quota once per run. Prefer rate limit info from API response when available.
 * Otherwise log local call count and point to dashboard for real usage.
 */
export function logSgoQuotaOnce(info: SgoQuotaInfo): void {
  const { requestsUsed, requestsMax, entitiesUsed, entitiesMax } = info;
  if (entitiesUsed != null && entitiesMax != null) {
    console.log(
      `[SGO] quota: ${requestsUsed}/${requestsMax} requests, ${entitiesUsed}/${entitiesMax} entities`
    );
  } else {
    console.log(
      `[SGO] quota: ${requestsUsed}/${requestsMax} requests today (see SGO dashboard for entities, e.g. ${SGO_DASHBOARD_ENTITIES_MAX})`
    );
  }
}

/**
 * Build quota info from local usage (OddsCache). Call after a successful SGO fetch.
 */
export function sgoQuotaFromLocalUsage(localCallCount: number, maxCallsPerDay: number): SgoQuotaInfo {
  return {
    requestsUsed: localCallCount,
    requestsMax: maxCallsPerDay,
  };
}
