/**
 * Phase 30 — Single source for Vite preview port used by Playwright canonical-samples UI smoke.
 * Override with env PLAYWRIGHT_PREVIEW_PORT (1–65535); invalid values fall back to default.
 */

export const DEFAULT_PLAYWRIGHT_PREVIEW_PORT = 4173;

export function resolvePlaywrightPreviewPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PLAYWRIGHT_PREVIEW_PORT;
  if (raw === undefined || raw === "") {
    return DEFAULT_PLAYWRIGHT_PREVIEW_PORT;
  }
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    return DEFAULT_PLAYWRIGHT_PREVIEW_PORT;
  }
  return n;
}
