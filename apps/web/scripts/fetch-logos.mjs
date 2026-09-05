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
 * The chain's own tokens, from the one place that actually indexes this chain.
 *
 * These have no ticker any equity service has heard of, so they had no logo at all and fell back to
 * a two-letter monogram — which is honest and also looks like a row of placeholders. DexScreener
 * indexes Robinhood Chain (its pairs come back with `chainId: "robinhood"`) and hosts the artwork
 * each project submitted, which is the same image their own traders see.
 *
 * The URLs are pinned rather than looked up at build time on purpose. The lookup API sits behind a
 * bot check that a script cannot pass, and an image whose address can change under us is an image
 * that can change into something else — so each was fetched once, LOOKED AT, and written down.
 * Re-check them by hand rather than trusting a redirect:
 *
 *   https://api.dexscreener.com/latest/dex/tokens/<address>   → pairs[].info.imageUrl
 */
const CHAIN_NATIVE = {
  // 0x39dBED3a2bd333467115dE45665cC57F813C4571 — the launchpad's own token: a silver P.
  PONS: "https://cdn.dexscreener.com/cms/images/dkmXs8KYMyMXjuU1?width=800&height=800&quality=95&format=auto",
  // 0x020bfC650A365f8BB26819deAAbF3E21291018b4 — the crying-cat meme, which is the whole brand.
  CASHCAT: "https://cdn.dexscreener.com/cms/images/Lq7a3pS9Wn8EuGp0?width=800&height=800&quality=95&format=auto",
  // 0x56910D4409F3a0C78C64DD8D0545FF0705389870 — four squares on a blue gradient.
  INDEX: "https://cdn.dexscreener.com/cms/images/LTfdhAlnWijozhDa?width=800&height=800&quality=95&format=auto",
};

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
// Both are drawn instead, by `draw-crypto-logos.py`, for reasons that file explains: GLD's sources
// are all unreadable text cards (and State Street's own mark would make it a twin of SPY), and
// DJT's is still the SPAC it merged out of in 2024 — the wrong company, not a poor picture.

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

// The chain's own tokens, from their own source.
for (const [t, src] of Object.entries(CHAIN_NATIVE)) {
  const file = join(OUT, `${t}.png`);
  if (!FORCE && existsSync(file)) continue;
  try {
    const res = await fetch(src, {
      signal: AbortSignal.timeout(20000),
      // The CDN serves a script a plain image; the lookup API in front of it does not.
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 400) throw new Error(`${buf.length} bytes, too small to be a logo`);
    writeFileSync(file, buf);
    wrote.push(t);
  } catch (e) {
    missing.push(`${t} (${e.message})`);
  }
}

// Anything already on disk counts toward coverage.
const have = new Set(readdirSync(OUT).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)));
for (const f of readdirSync(OUT).filter((f) => f.endsWith(".png"))) {
  seen.set(createHash("sha256").update(readFileSync(join(OUT, f))).digest("hex"), f.slice(0, -4));
}

console.log(`${subjects.length} tickers, ${have.size} with a logo on disk`);
if (wrote.length) console.log(`  downloaded: ${wrote.join(" ")}`);
if (duplicates.length) console.log(`  dropped as a shared placeholder: ${duplicates.join(", ")}`);
const none = [...subjects, ...Object.keys(CHAIN_NATIVE)].filter((t) => !have.has(t));
if (none.length) console.log(`  no logo, will fall back to the ticker chip: ${none.join(" ")}`);
