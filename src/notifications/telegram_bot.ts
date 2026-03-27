/**
 * src/notifications/telegram_bot.ts
 * Send plain text messages to Telegram using node-fetch.
 * ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Phase 16L: retries on 429 Too Many Requests using parameters.retry_after.
 */

import fetch from "node-fetch";

const TELEGRAM_API = "https://api.telegram.org";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TelegramApiResult {
  ok?: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

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

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TelegramApiResult;
    if (data.ok) {
      return true;
    }
    const retryAfter = data.parameters?.retry_after;
    if (data.error_code === 429 && typeof retryAfter === "number") {
      console.warn(
        `[Telegram] sendMessage rate limited; retry after ${retryAfter}s (attempt ${attempt + 1}/${maxAttempts})`
      );
      await sleep((retryAfter + 1) * 1000);
      continue;
    }
    console.warn("[Telegram] sendMessage failed:", data.description ?? res.status);
    return false;
  }
  console.warn("[Telegram] sendMessage: max retries exceeded after 429s");
  return false;
}
