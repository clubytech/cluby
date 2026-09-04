import { log, redact } from "./env.ts";

const token = process.env.TELEGRAM_TOKEN;
const chat = process.env.TELEGRAM_CHAT;

/** Repeats are suppressed for an hour: an alert that fires every two seconds is one nobody reads. */
const lastSent = new Map<string, number>();
const REPEAT_MS = 60 * 60 * 1000;

export async function alert(key: string, rawText: string) {
  const text = redact(rawText);
  log("ALERT", text);
  const now = Date.now();
  const last = lastSent.get(key);
  if (last && now - last < REPEAT_MS) return;
  lastSent.set(key, now);

  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  }).catch((e) => log("telegram failed", e));
}
