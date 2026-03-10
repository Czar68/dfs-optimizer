/**
 * src/notifications/telegram_bot.ts
 * Send plain text messages to Telegram using node-fetch.
 * ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

import fetch from "node-fetch";

const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegramText(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return false;
  }
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: message,
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
