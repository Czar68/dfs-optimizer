/**
 * Centralized Telegram notifications. Failures are logged and do not crash the process.
 */

import https from "https";
import type { MergedProp } from "../types/unified-prop";

function sendTelegramRequest(
  token: string,
  method: string,
  body: object
): Promise<{ ok: boolean; description?: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
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
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.ok ? { ok: true } : { ok: false, description: parsed.description ?? data });
          } catch {
            resolve({ ok: false, description: data });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, description: String(err.message) }));
    req.write(payload);
    req.end();
  });
}

class NotificationService {
  /**
   * Send merged-props summary to Telegram. Uses TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
   * Failures are logged locally; does not throw.
   */
  /** Max props to consider for the alert (avoids heavy sort on very large arrays). */
  private static readonly ALERT_CAP = 5000;

  /** Max lines in the message body (top N by edge). */
  private static readonly ALERT_TOP_N = 5;

  async sendAlert(data: MergedProp[]): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    try {
      if (!token || !chatId) {
        console.warn("[NotificationService] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set; skipping sendAlert.");
        return;
      }
      const total = data.length;
      const capped = total > NotificationService.ALERT_CAP ? data.slice(0, NotificationService.ALERT_CAP) : data;
      const top = capped
        .slice()
        .sort((a, b) => b.edge - a.edge)
        .slice(0, NotificationService.ALERT_TOP_N);
      const lines = [
        `Merge complete: ${total} props${total > NotificationService.ALERT_CAP ? ` (top ${NotificationService.ALERT_CAP} considered)` : ""}`,
        ...top.map((p) => `${p.player} ${p.statType} ${p.lineValue} edge=${(p.edge * 100).toFixed(1)}%`),
      ];
      const text = lines.join("\n");
      const result = await sendTelegramRequest(token, "sendMessage", {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      });
      if (!result.ok) {
        console.warn("[NotificationService] Telegram sendAlert failed:", result.description);
      }
    } catch (err) {
      console.warn("[NotificationService] sendAlert error (non-fatal):", err instanceof Error ? err.message : String(err));
    }
  }
}

export const notificationService = new NotificationService();
