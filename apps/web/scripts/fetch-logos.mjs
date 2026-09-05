/**
 * Pull a logo for every ticker in the catalogue, once, into `public/logos/`.
 *
 * Downloaded rather than hot-linked, on purpose. A logo CDN in the render path is a third party that
 * can rate-limit, go down, change its URL scheme or watch our users, in exchange for saving a few
 * kilobytes in the repository. Locally they are also cacheable forever and cannot shift the layout.
 *
 * Re-runnable: an existing file is left alone unless --force is passed.
 *
 *   node apps/web/scripts/fetch-logos.mjs [--force]
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "logos");
const FORCE = process.argv.includes("--force");

const { marketCatalog } = await import("@cluby/config");

// The tickers we need art for: whatever the market is about, which is the collateral on a long
// market and the borrowed asset on a short one.
/**
 * The source is a US-EQUITY logo API, so it must only be asked about equities. Given a ticker it
 * does not list, it does not 404 — it returns whatever company its search matched, and "WETH" came
 * back as the logo of a company called Wetouch. A wrong logo is worse than a missing one: the
 * monogram fallback is honest, and a confidently wrong mark is not.
 *
 * So anything that is not a listed equity or ETF is excluded by name. Ether gets its own mark drawn
 * in `draw-crypto-logos.mjs`; the chain-native tokens have no company and use the monogram.
 */
const NOT_EQUITIES = new Set(["WETH", "PONS", "CASHCAT", "INDEX", "USDG"]);

/**
 * Equities whose logo is a multi-line text card rather than a mark. Both of these are CORRECT — GLD
 * really does ship "SPDR Gold Shares / Exchange Traded Gold Security" set in three lines, and DJT
 * carries its predecessor's Digital World Acquisition Corp block — and both are an unreadable smear
 * at the 36px the table renders them at. The monogram is the better answer: it is legible, it is
 * deliberate, and it does not pretend to information it cannot convey at that size.
 *
 * This is a judgement made by looking at all 38 rendered small, not by a metric. Detail density
 * flags TSM and Invesco, which read fine; there is no measurement that separates "busy" from
 * "illegible" as well as looking does.
 */
const TEXT_CARD_NOT_A_MARK = new Set(["GLD", "DJT"]);

const subjects = [...new Set(marketCatalog.map((m) => (m.side === "long" ? m.collateral : m.loan)))]
  .filter((s) => !NOT_EQUITIES.has(s) && !TEXT_CARD_NOT_A_MARK.has(s))
  .sort();

mkdirSync(OUT, { recursive: true });

/**
 * A source that returns one generic placeholder for everything it does not know is worse than a
 * source that 404s, because the placeholder looks like a success. Hashes are compared across the
 * whole run and any image that appears for more than one ticker is thrown away.
 */
const url = (t) => `https://financialmodelingprep.com/image-stock/${t}.png`;

const seen = new Map(); // hash -> first ticker that produced it
const wrote = [];
const missing = [];
const duplicates = [];

for (const t of subjects) {
  const file = join(OUT, `${t}.png`);
  if (!FORCE && existsSync(file)) continue;

  let buf;
  try {
    const res = await fetch(url(t), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`content-type ${type}`);
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 400) throw new Error(`${buf.length} bytes, too small to be a logo`);
  } catch (e) {
    missing.push(`${t} (${e.message})`);
    continue;
  }

  const hash = createHash("sha256").update(buf).digest("hex");
  if (seen.has(hash)) {
    duplicates.push(`${t} = ${seen.get(hash)}`);
    continue;
  }
  seen.set(hash, t);
  writeFileSync(file, buf);
  wrote.push(t);
}

// Anything already on disk counts toward coverage.
const have = new Set(readdirSync(OUT).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)));
for (const f of readdirSync(OUT).filter((f) => f.endsWith(".png"))) {
  seen.set(createHash("sha256").update(readFileSync(join(OUT, f))).digest("hex"), f.slice(0, -4));
}

console.log(`${subjects.length} tickers, ${have.size} with a logo on disk`);
if (wrote.length) console.log(`  downloaded: ${wrote.join(" ")}`);
if (duplicates.length) console.log(`  dropped as a shared placeholder: ${duplicates.join(", ")}`);
const none = subjects.filter((t) => !have.has(t));
if (none.length) console.log(`  no logo, will fall back to the ticker chip: ${none.join(" ")}`);
