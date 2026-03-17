// src/telegram_pusher.ts
//
// Telegram Bot Push — Phase 5
//
// Sends the Top-5 Innovative Cards to a Telegram chat as a formatted message
// plus the radar chart SVG as a document attachment.
//
// Required env vars (add to .env; see .env.example for a template):
//   TELEGRAM_BOT_TOKEN  – e.g. "7123456789:AAFxxxxxxxx" (from @BotFather)
//   TELEGRAM_CHAT_ID    – e.g. "-1001234567890" (channel) or "123456789" (private)
// If either is missing, push calls log and skip (no default values).
//
// How to get them:
//   1. Message @BotFather on Telegram → /newbot → copy the token
//   2. Add the bot to your channel; get chat_id via:
//      https://api.telegram.org/bot{TOKEN}/getUpdates
//
// Uses only Node.js built-ins (https, fs) — no telegraf dependency needed.

import https from "https";
import fs    from "fs";
import path  from "path";
import { InnovativeCard }          from "./build_innovative_cards";
import { EdgeClusterReport }       from "./build_innovative_cards";
import { computePortfolioStatDistribution, buildAsciiStatBar } from "./stat_balance_chart";
import { cliArgs } from "./cli_args";

// ---------------------------------------------------------------------------
// Telegram Bot API helpers (raw HTTPS, no deps)
// ---------------------------------------------------------------------------

function tgRequest(
  token:    string,
  method:   string,
  body:     object
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path:     `/bot${token}/${method}`,
        method:   "POST",
        headers:  {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ ok: false, description: data }); }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/** Upload a local file to Telegram as a document (multipart/form-data). */
function tgSendDocument(
  token:   string,
  chatId:  string,
  caption: string,
  filePath: string
): Promise<{ ok: boolean; description?: string }> {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath);
    const fileName    = path.basename(filePath);
    const boundary    = "----TgBoundary" + Date.now().toString(16);
    const CRLF        = "\r\n";

    const head = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="chat_id"`,
      "",
      chatId,
      `--${boundary}`,
      `Content-Disposition: form-data; name="caption"`,
      "",
      caption,
      `--${boundary}`,
      `Content-Disposition: form-data; name="document"; filename="${fileName}"`,
      `Content-Type: image/svg+xml`,
      "",
      "",
    ].join(CRLF);

    const tail = CRLF + `--${boundary}--` + CRLF;
    const body = Buffer.concat([
      Buffer.from(head),
      fileContent,
      Buffer.from(tail),
    ]);

    const req = https.request(
      {
        hostname: "api.telegram.org",
        path:     `/bot${token}/sendDocument`,
        method:   "POST",
        headers:  {
          "Content-Type":   `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ ok: false, description: data }); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HTML-safe escaping (parse_mode=HTML avoids MarkdownV2 escaping hell)
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Format run timestamp for header: "2026-03-13 15:10" (date + HH:MM). */
function formatHeaderDateAndTime(runTimestamp: string): string {
  if (runTimestamp.includes("T")) {
    const datePart = runTimestamp.slice(0, 10);
    const timePart = runTimestamp.slice(11, 16); // HH:MM
    return `${datePart} ${timePart}`;
  }
  const datePart = runTimestamp.slice(0, 10);
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const timePart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${datePart} ${timePart}`;
}

/** Skip sending if we sent in the last 60s (avoids duplicate messages from multiple call sites). */
const TELEGRAM_DEBOUNCE_MS = 60_000;
let lastTelegramSendTime = 0;

function shouldSkipTelegramSend(): boolean {
  return Date.now() - lastTelegramSendTime < TELEGRAM_DEBOUNCE_MS;
}

function recordTelegramSent(): void {
  lastTelegramSendTime = Date.now();
}

// ---------------------------------------------------------------------------
// Format a single card for the Telegram message
// ---------------------------------------------------------------------------
function formatCard(
  card:    InnovativeCard,
  bankroll: number,
  rank:    number
): string {
  const medals   = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const medal    = medals[rank - 1] ?? `#${rank}`;
  const kellyAmt = Math.round(card.kellyFrac * bankroll);

  const legLines = card.legs.map(l => {
    const statAbbr = l.stat.toUpperCase().slice(0, 3);
    const edge     = (l.edge * 100).toFixed(1);
    const prob     = (l.trueProb * 100).toFixed(0);
    return `  • <b>${esc(l.player)}</b> ${statAbbr} ${l.line} ${l.outcome === "over" ? "↑" : "↓"}  edge <b>+${edge}%</b> | p=${prob}%`;
  });

  const statBal = Object.entries(card.statBalance)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(" ");

  const cluster  = card.edgeCluster ? `\n🎯 Cluster: <code>${esc(card.edgeCluster)}</code>` : "";
  const liqStar  = card.liquidity >= 0.85 ? "🔵" : card.liquidity >= 0.70 ? "🟡" : "🔴";

  return [
    `${medal} <b>${card.flexType}</b>  EV <b>+${(card.cardEV * 100).toFixed(1)}%</b>  comp ${(card.compositeScore * 100).toFixed(1)}%`,
    `   Div ${card.diversity.toFixed(2)} | Corr ${card.correlation.toFixed(2)} | Liq ${liqStar} ${card.liquidity.toFixed(2)} | Kelly $${kellyAmt}`,
    ...legLines,
    `   📐 Stats: ${statBal}${cluster}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main export: pushTop5ToTelegram
// ---------------------------------------------------------------------------
export interface TelegramPushOptions {
  bankroll?:    number;  // default 1000
  svgPath?:     string;  // path to radar chart SVG to attach
  sendChart?:   boolean; // default true if svgPath exists
  sheetUrl?:    string;   // optional Sheets link (env TELEGRAM_SHEET_URL)
}

export async function pushTop5ToTelegram(
  cards:    InnovativeCard[],
  clusters: EdgeClusterReport[],
  date:     string,
  opts:     TelegramPushOptions = {}
): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const { bankroll = 1000, svgPath, sendChart = true, sheetUrl = process.env.TELEGRAM_SHEET_URL } = opts;

  if (!token || !chatId) {
    console.log(`
[Telegram] ⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.
           Add them to .env to enable push notifications:

           TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
           TELEGRAM_CHAT_ID=-1001234567890

           How to get them:
             1. Message @BotFather → /newbot → copy the token
             2. Add bot to your channel; get chat_id via:
                https://api.telegram.org/bot{TOKEN}/getUpdates
`);
    return;
  }

  // Strict gate: only Tier 1 cards go to Telegram.
  const tierOneCards = cards.filter((c) => c.tier === 1);
  const top5 = tierOneCards.slice(0, 5);
  if (top5.length === 0) {
    console.log("[Telegram] No tier-1 cards to push.");
    return;
  }

  // Build stat distribution for ASCII bar
  const dist    = computePortfolioStatDistribution(cards);
  const statBar = buildAsciiStatBar(dist);
  const totalKelly = tierOneCards.reduce((s, c) => s + c.kellyFrac, 0);

  // Header
  const header = [
    `🏀 <b>Innovative Cards — ${esc(date)}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `Portfolio: <b>${tierOneCards.length} tier-1 cards</b> | Kelly total: <b>${(totalKelly * 100).toFixed(1)}%</b> / $${Math.round(totalKelly * bankroll)}`,
    `Clusters: ${clusters.slice(0, 3).map(c => `<code>${esc(c.key)}</code> +${(c.avgEdge*100).toFixed(1)}%`).join(" · ")}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    "",
  ].join("\n");

  // Top 5 cards
  const cardBlocks = top5.map((card, i) => formatCard(card, bankroll, i + 1));

  // Stat balance ASCII bar + sheet link
  const topEV = top5.length ? (top5[0].cardEV * 100).toFixed(1) : "—";
  const sheetLine = sheetUrl ? `\n📊 <a href="${sheetUrl.replace(/&/g, "&amp;")}">Sheets (Cards)</a>` : "";
  const footer = [
    "",
    `━━━━━━━━━━━━━━━━━━━━━`,
    `<pre>${esc(statBar)}</pre>`,
    `EV Top: <b>+${topEV}%</b> | Tier-1 Cards: ${tierOneCards.length}${sheetLine}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `<i>Generated by NBA Props Optimizer • /run --innovative --live-liq</i>`,
  ].join("\n");

  const fullMessage = [header, ...cardBlocks, footer].join("\n\n");

  if (cliArgs.telegramDryRun) {
    console.log("\n[Telegram DRY RUN] Would send PP top-5:\n");
    console.log(fullMessage.replace(/<\/?[^>]+>/g, ""));
    console.log("\n[Telegram DRY RUN] Copy/paste above to Telegram manually.\n");
    return;
  }

  // Send text message
  console.log("[Telegram] Sending top-5 cards message...");
  const msgResult = await tgRequest(token, "sendMessage", {
    chat_id:    chatId,
    text:       fullMessage,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  if (msgResult.ok) {
    console.log("[Telegram] ✅ Message sent successfully");
  } else {
    console.error(`[Telegram] ❌ sendMessage failed: ${msgResult.description}`);
  }

  // Send radar chart SVG as document
  if (sendChart && svgPath && fs.existsSync(svgPath)) {
    console.log(`[Telegram] Attaching radar chart (${path.basename(svgPath)})...`);
    const caption = `📊 Stat Balance Radar — ${date} (${cards.length} cards)`;
    const docResult = await tgSendDocument(token, chatId, caption, svgPath);

    if (docResult.ok) {
      console.log("[Telegram] ✅ Radar chart attached successfully");
    } else {
      console.error(`[Telegram] ❌ sendDocument failed: ${docResult.description}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Load underdog-legs.csv into id -> "Player STAT line" for UD message
// ---------------------------------------------------------------------------
function loadUdLegLabels(legsCsvPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(legsCsvPath)) return map;
  const raw = fs.readFileSync(legsCsvPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return map;
  const headers = lines[0].split(",").map((h) => h.trim());
  const idIdx = headers.indexOf("id");
  const playerIdx = headers.indexOf("player");
  const statIdx = headers.indexOf("stat");
  const lineIdx = headers.indexOf("line");
  if (idIdx < 0 || playerIdx < 0 || statIdx < 0 || lineIdx < 0) return map;
  const statShort: Record<string, string> = { points: "PTS", rebounds: "REB", assists: "AST", threes: "3PM" };
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((c) => c.trim());
    const id = row[idIdx];
    const player = row[playerIdx] ?? "";
    const stat = (statShort[row[statIdx] ?? ""] ?? (row[statIdx] ?? "")).toUpperCase();
    const line = row[lineIdx] ?? "";
    if (id) map.set(id, `${player} ${stat} ${line}`);
  }
  return map;
}

// ---------------------------------------------------------------------------
// UD Top 5 from underdog-cards.csv (for --platform both --telegram)
// ---------------------------------------------------------------------------
export async function pushUdTop5FromCsv(
  csvPath:      string,
  runTimestamp: string,
  bankroll:     number
): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("[Telegram] UD skip: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.");
    return;
  }

  if (!fs.existsSync(csvPath)) {
    console.log("[Telegram] UD skip: underdog-cards.csv not found.");
    return;
  }

  if (shouldSkipTelegramSend()) {
    console.log("[Telegram] UD skip: last send was < 60s ago (debounce).");
    return;
  }

  const dir = path.dirname(csvPath);
  const legsPath = path.join(dir, "underdog-legs.csv");
  const legLabels = loadUdLegLabels(legsPath);

  const raw   = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    console.log("[Telegram] UD skip: no UD cards in CSV.");
    return;
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const flexIdx = headers.indexOf("flexType");
  const evIdx   = headers.indexOf("cardEv");
  const kellyIdx = headers.indexOf("kellyStake");
  const winProbIdx = headers.indexOf("winProbCash");
  const deepLinkIdx = headers.indexOf("DeepLink");
  const legIdIdxs = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => headers.indexOf(`leg${n}Id`));
  if (flexIdx < 0 || evIdx < 0) {
    console.log("[Telegram] UD skip: CSV missing flexType/cardEv columns.");
    return;
  }

  const top5Rows: string[][] = [];
  for (let i = 1; i < lines.length && top5Rows.length < 5; i++) {
    const row = lines[i].split(",").map((c) => c.trim());
    if (row.length <= Math.max(flexIdx, evIdx)) continue;
    top5Rows.push(row);
  }

  if (top5Rows.length === 0) {
    console.log("[Telegram] UD skip: no parseable UD card rows.");
    return;
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const cardLines = top5Rows.map((row, i) => {
    const flex   = row[flexIdx] ?? "—";
    const evPct  = row[evIdx] ? (parseFloat(row[evIdx]) * 100).toFixed(1) : "—";
    const kelly  = kellyIdx >= 0 && row[kellyIdx] ? `Kelly $${row[kellyIdx]}` : "";
    const hitPct = winProbIdx >= 0 && row[winProbIdx] !== undefined && row[winProbIdx] !== ""
      ? (parseFloat(row[winProbIdx]) * 100).toFixed(1)
      : null;
    const deepLink = deepLinkIdx >= 0 && row[deepLinkIdx] && row[deepLinkIdx].trim() ? row[deepLinkIdx].trim() : null;
    const medal  = medals[i] ?? `#${i + 1}`;
    const legParts: string[] = [];
    for (const idx of legIdIdxs) {
      if (idx >= 0 && row[idx]) {
        const label = legLabels.get(row[idx]);
        if (label) legParts.push(label);
      }
    }
    const legLine = legParts.length > 0 ? `\n   ${legParts.join(" • ")}` : "";
    const hitLine = hitPct != null ? `  Hit: ${hitPct}%` : "";
    const linkLine = deepLink
      ? `\n   🔗 <a href="${esc(deepLink)}">Play on Underdog</a>`
      : "";
    return `${medal} <b>${esc(flex)}</b>  EV <b>+${evPct}%</b> ${kelly}${hitLine}${legLine}${linkLine}`;
  });

  const totalCards = lines.length - 1;
  const topEV = top5Rows.length && top5Rows[0][evIdx] ? (parseFloat(top5Rows[0][evIdx]) * 100).toFixed(1) : "—";
  const bankrollLine = `Bankroll: $${bankroll}`;
  const sheetUrl = process.env.TELEGRAM_SHEET_URL;
  const sheetLine = sheetUrl ? `\n📊 <a href="${sheetUrl.replace(/&/g, "&amp;")}">Sheets</a>` : "";
  const headerDateAndTime = formatHeaderDateAndTime(runTimestamp);
  const text = [
    `🧠 <b>Optimizer Run — ${esc(headerDateAndTime)}</b>`,
    `Cards: <b>${totalCards}</b> | Legs: (see run) | EV Top: <b>+${topEV}%</b>`,
    `${bankrollLine}${sheetLine}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `<b>UD Top 5</b>`,
    "",
    ...cardLines,
    "",
    `<i>Generated by NBA Props Optimizer • --platform both --telegram</i>`,
  ].join("\n");

  if (cliArgs.telegramDryRun) {
    console.log("\n[Telegram DRY RUN] Would send UD top-5:\n");
    console.log(text.replace(/<\/?[^>]+>/g, ""));
    console.log("\n[Telegram DRY RUN] Copy/paste above to Telegram manually.\n");
    return;
  }

  console.log("[Telegram] Sending UD top-5 message...");
  const result = await tgRequest(token, "sendMessage", {
    chat_id:    chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  if (result.ok) {
    recordTelegramSent();
    console.log("[Telegram] ✅ UD top-5 message sent");
  } else {
    console.error(`[Telegram] ❌ UD sendMessage failed: ${result.description}`);
  }
}

// ---------------------------------------------------------------------------
// Quick connectivity test: verify bot token + chat_id are working
// ---------------------------------------------------------------------------
export async function testTelegramConnection(): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("[Telegram] No credentials configured.");
    return false;
  }

  const result = await tgRequest(token, "sendMessage", {
    chat_id:    chatId,
    text:       "🏀 NBA Props Optimizer — Telegram connection test OK!",
    parse_mode: "HTML",
  });

  if (result.ok) {
    console.log("[Telegram] ✅ Connection test passed");
    return true;
  } else {
    console.error(`[Telegram] ❌ Connection test failed: ${result.description}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Error/alert notifications: push failures, low cards, quota issues
// ---------------------------------------------------------------------------

export async function sendTelegramAlert(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  if (shouldSkipTelegramSend()) {
    console.log("[Telegram] Alert skip: last send was < 60s ago (debounce).");
    return;
  }
  const text = `🚨 <b>Optimizer Alert</b>\n${esc(message)}`;
  const result = await tgRequest(token, "sendMessage", {
    chat_id:    chatId,
    text,
    parse_mode: "HTML",
  });
  if (result.ok) {
    recordTelegramSent();
    console.log("[Telegram] Alert sent");
  } else {
    console.error(`[Telegram] Alert failed: ${result.description}`);
  }
}
