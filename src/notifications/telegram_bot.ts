/**
 * src/notifications/telegram_bot.ts
 * Send plain text messages to Telegram using node-fetch.
 * ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

import fetch from "node-fetch";

const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramGateInput {
  tier?: number;
}

function sanitizeTelegramText(message: string): string {
  return String(message)
    // Remove ISO timestamps and common datetime strings to avoid raw schedule spam.
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, "[time-blocked]")
    .replace(/\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\b/g, "[time-blocked]")
    .replace(/\b(start(?:_time|time)?|game(?:_time|time)?)\s*[:=]\s*[^,\n]+/gi, "[time-blocked]");
}

export async function sendTelegramText(message: string, gate: TelegramGateInput = {}): Promise<boolean> {
  if (gate.tier !== 1) {
    console.log("[Telegram] blocked: only tier=1 messages are allowed.");
    return false;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return false;
  }
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: sanitizeTelegramText(message),
    disable_web_page_preview: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (data.ok) {
    return true;
  }
  console.warn("[Telegram] sendMessage failed:", data.description ?? res.status);
  return false;
}
