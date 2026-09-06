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


/**
 * Is this failure the transport rather than the chain?
 *
 * The distinction is the whole difference between "your oracle is broken" and "one server is
 * down", and the keeper used to report the second as the first — `.catch(() => null)` threw the
 * error away, so a network timeout and a reverting contract arrived as the same nothing, and the
 * message blamed the oracle either way. Overnight that produced eight separate alerts naming eight
 * healthy oracles, when what had happened was that one host stopped answering for an hour.
 */
export function isTransportFailure(e: unknown): boolean {
  const text = String(
    (e as { shortMessage?: string; details?: string; message?: string })?.shortMessage ??
      (e as { message?: string })?.message ??
      e,
  );
  return /HTTP request failed|RPC Request failed|fetch failed|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|socket hang up|502|503|504|429/i.test(
    text,
  );
}

/**
 * Say when something started working again.
 *
 * An operator holding a phone can see that a thing broke and cannot see that it recovered, so a
 * quiet chat after an alert is indistinguishable from a keeper that has given up. `recovered` only
 * speaks if the matching alert actually went out, so a blip that never alarmed anyone does not
 * generate a cheerful message about a problem they never had.
 */
export async function recovered(key: string, text: string) {
  if (!lastSent.has(key)) return;
  lastSent.delete(key);
  log("RECOVERED", text);
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: redact(text), disable_web_page_preview: true }),
  }).catch((e) => log("telegram failed", e));
}
