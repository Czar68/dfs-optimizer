/**
 * Phase 23 — Pure presentation lines for canonical sample bundle (no React; no new derived business logic).
 */
import type { CanonicalPpEnvelope, CanonicalSampleSummary, CanonicalUdEnvelope } from "./canonical_sample_artifacts";

function firstPpLegId(card: unknown): string | null {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const legs = (card as { legs?: unknown }).legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const leg0 = legs[0];
  if (!leg0 || typeof leg0 !== "object") return null;
  const id = (leg0 as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function firstUdLegId(card: unknown): string | null {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const o = card as { legIds?: unknown; legs?: unknown };
  if (Array.isArray(o.legIds) && o.legIds.length > 0 && typeof o.legIds[0] === "string") {
    return o.legIds[0];
  }
  const legs = o.legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const leg0 = legs[0];
  if (!leg0 || typeof leg0 !== "object") return null;
  const pick = (leg0 as { pick?: { id?: unknown } }).pick;
  if (pick && typeof pick.id === "string") return pick.id;
  return null;
}

function ppCardShape(card: unknown): { size: string; mode: string } | null {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const c = card as { size?: unknown; mode?: unknown };
  const size = c.size;
  const mode = c.mode;
  return {
    size: typeof size === "number" ? String(size) : String(size ?? "?"),
    mode: typeof mode === "string" ? mode : String(mode ?? "?"),
  };
}

/**
 * Deterministic text lines for read-only UI / debugging (artifact fields only).
 */
export function formatCanonicalSamplesPanelLines(
  pp: CanonicalPpEnvelope,
  ud: CanonicalUdEnvelope,
  summary: CanonicalSampleSummary
): string[] {
  const lines: string[] = [];
  lines.push(`contract=${summary.contract} schemaVersion=${summary.schemaVersion}`);
  lines.push(
    `PP: ${summary.pp.cardCount} cards | modes=${summary.pp.modes.join(",")} | flexSizes=${summary.pp.flexSizes.join(",")}`
  );
  lines.push(
    `UD: ${summary.ud.cardCount} cards | structureIds=${summary.ud.structureIds.join(",")} | flexTypes=${summary.ud.flexTypes.join(",")}`
  );
  lines.push(`sources: pp=${summary.sources.pp.relativePath} (${summary.sources.pp.cardCount}) ud=${summary.sources.ud.relativePath} (${summary.sources.ud.cardCount})`);

  const pp0 = pp.cards[0];
  const ud0 = ud.cards[0];
  const ppShape = ppCardShape(pp0);
  const ppLeg = firstPpLegId(pp0);
  if (ppShape) {
    lines.push(`preview PP[0]: size=${ppShape.size} mode=${ppShape.mode} | firstLegId=${ppLeg ?? "n/a"}`);
  } else {
    lines.push("preview PP[0]: n/a");
  }

  const udSid =
    ud0 && typeof ud0 === "object" && !Array.isArray(ud0) && typeof (ud0 as { structureId?: unknown }).structureId === "string"
      ? (ud0 as { structureId: string }).structureId
      : "n/a";
  const udLeg = firstUdLegId(ud0);
  lines.push(`preview UD[0]: structureId=${udSid} | firstLegId=${udLeg ?? "n/a"}`);

  return lines;
}
