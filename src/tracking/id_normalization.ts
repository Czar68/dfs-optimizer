/**
 * Deterministic stable ids for modeling (no external ID service).
 * Same inputs → same ids across runs and machines.
 */

import crypto from "crypto";

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.'’]/g, "");
}

/** Normalized stat token for market keys (aligns with internal StatCategory strings). */
export function normalizeStatToken(stat: string): string {
  return stat.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Stable player id: hash of league + normalized name. */
export function stablePlayerId(league: string, player: string): string {
  const h = crypto.createHash("sha256").update(`${norm(league)}|${norm(player)}`).digest("hex");
  return `pid_${h.slice(0, 14)}`;
}

/** Stable market id: hash of league + player + stat + line. */
export function stableMarketId(league: string, player: string, stat: string, line: number): string {
  const h = crypto
    .createHash("sha256")
    .update(`${norm(league)}|${norm(player)}|${normalizeStatToken(stat)}|${line}`)
    .digest("hex");
  return `mid_${h.slice(0, 16)}`;
}
