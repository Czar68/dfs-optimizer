/**
 * Consolidated Telegram message builder and sender.
 *
 * AUDIT (read-only documentation):
 * A. sendTelegramMessage: Previously in telegram_pusher.ts (pushTop5ToTelegram for PP,
 *    pushUdTop5FromCsv for UD). Both used the same tgRequest() internally but were
 *    separate code paths. Now a single sendTelegramMessage() lives here; telegram_pusher
 *    retains tgRequest for alerts/documents but the consolidated top-5 send is here.
 * B. Current per-site payloads: PP = top 5 tier-1 innovative cards (HTML), with stat
 *    balance and radar chart attachment. UD = top 5 rows from underdog-cards.csv (HTML),
 *    with leg labels and optional DeepLink. Two separate messages per run.
 * C. Call sequence: PP message sent in run_optimizer.ts Phase 5e (after innovative
 *    card build, after writeTieredCsvs, after radar chart). UD message sent in
 *    run_optimizer.ts after runUnderdogOptimizer and runSheetsPush (and low-cards
 *    alert if totalCards < 100). Both before archive; sheets push happens in between.
 * D. Deeplink: UD CSV column is "DeepLink" (telegram_pusher deepLinkIdx). PP
 *    innovative cards / tier CSVs do not have a DeepLink column (Sheets schema has
 *    DeepLink in column T for display).
 */

import https from "https";
import type { LineMovementResult } from "../types";

export type TelegramLineMovement =
  | LineMovementResult
  | { direction: "toward" | "against" | "none"; lineDelta: number; oddsDelta: number; runsObserved: number };

export interface TelegramPlay {
  site: string;
  tier: number;
  compositeScore: number;
  player: string;
  statLine: string;
  pick: string;
  cardEv: number;
  kellyStake: number;
  deepLink?: string;
  oddsType?: string;
  lineMovement?: TelegramLineMovement;
}

export interface ConsolidatedMeta {
  runTs: string;
  bankroll: number;
  totalCards: number;
  matchRates: Record<string, string>;
  isMock: boolean;
}

const MAX_MESSAGE_LENGTH = 4000;
const MARKDOWN_V2_ESCAPE = /[_*[\]()~`>#+=|{}.!-]/g;

function escapeMarkdownV2(s: string): string {
  return s.replace(MARKDOWN_V2_ESCAPE, (ch) => "\\" + ch);
}

function oddsTypeBadge(oddsType?: string): string {
  if (!oddsType || oddsType === "standard") return "";
  if (oddsType === "goblin") return "🟢 goblin ";
  if (oddsType === "demon") return "👹 demon ";
  return "";
}

/**
 * Build a single consolidated message: top 5 plays across all sites, ranked by
 * tier then compositeScore. MarkdownV2 formatted; truncated to 4000 chars if needed.
 */
export function buildConsolidatedMessage(
  plays: TelegramPlay[],
  meta: ConsolidatedMeta
): string {
  const sorted = [...plays].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.compositeScore - a.compositeScore;
  });
  const top5 = sorted.slice(0, 5);

  const runTsSafe = escapeMarkdownV2(meta.runTs.replace("T", "-").slice(0, 15));
  const bankrollStr = `$${meta.bankroll}`;
  const matchLine =
    Object.keys(meta.matchRates).length === 0
      ? "—"
      : Object.entries(meta.matchRates)
          .map(([k, v]) => `${k} ${escapeMarkdownV2(v)}`)
          .join(" · ");

  const lines: string[] = [];
  lines.push(`🎯 *DFS Top Plays* — ${runTsSafe}`);
  lines.push(`💰 Bankroll: ${escapeMarkdownV2(bankrollStr)} \\| Cards: ${meta.totalCards} total`);
  lines.push(`📊 Match rates: ${matchLine}`);
  if (meta.isMock) {
    lines.push("⚠️ MOCK RUN");
  }
  lines.push("");

  top5.forEach((play, i) => {
    const rank = i + 1;
    const badge = oddsTypeBadge(play.oddsType);
    const playerSafe = escapeMarkdownV2(play.player);
    const statLineSafe = escapeMarkdownV2(play.statLine);
    const evPct = (play.cardEv * 100).toFixed(1);
    const kellyStr = `$${Math.round(play.kellyStake)}`;
    const lm = play.lineMovement;
    const lineMovementSuffix = lm && "category" in lm
      ? (lm.category === "favorable" ? " 📈" : lm.category === "moderate_against" ? " 📉" : lm.category === "strong_against" ? " 📉📉" : "")
      : lm && "direction" in lm
        ? (lm.direction === "toward" ? " 📈" : lm.direction === "against" ? " 📉📉" : "")
        : "";
    const header = `*${rank}\\. \\[${escapeMarkdownV2(play.site)}\\] ${badge}${playerSafe} — ${statLineSafe}${lineMovementSuffix}*`;
    lines.push(header);
    const linkPart = play.deepLink
      ? ` \\| 🔗 [link](${play.deepLink.replace(/\\/g, "\\\\").replace(/\)/g, "\\)")})`
      : "";
    lines.push(
      `Tier ${play.tier} · EV ${escapeMarkdownV2(evPct)}% · Kelly ${escapeMarkdownV2(kellyStr)}${linkPart}`
    );
    lines.push("");
  });

  lines.push(`_Run: ${runTsSafe}_`);

  let out = lines.join("\n");
  if (out.length > MAX_MESSAGE_LENGTH) {
    out = out.slice(0, MAX_MESSAGE_LENGTH - 20) + "\n_\\.\\.\\. truncated_";
  }
  return out;
}

function tgRequest(
  token: string,
  method: string,
  body: object
): Promise<{ ok: boolean; description?: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, description: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send a single message to Telegram. Uses TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
 * If either is missing, logs a warning and resolves without sending.
 */
const g = globalThis as typeof globalThis & { __telegramPlays?: TelegramPlay[] };

export function getTelegramPlaysAccumulator(): TelegramPlay[] {
  if (typeof g.__telegramPlays === "undefined") {
    g.__telegramPlays = [];
  }
  return g.__telegramPlays;
}

export function clearTelegramPlaysAccumulator(): void {
  g.__telegramPlays = [];
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn(
      "[TELEGRAM] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set; skipping consolidated message."
    );
    return;
  }
  const result = await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  });
  if (!result.ok) {
    console.error(`[TELEGRAM] sendMessage failed: ${result.description ?? "unknown"}`);
  }
}
