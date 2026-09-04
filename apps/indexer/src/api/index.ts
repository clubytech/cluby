import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";
import { and, desc, eq, gt } from "ponder";

const app = new Hono();

/** BigInt has no JSON representation; sending it as a string keeps precision the wire would lose. */
const json = (data: unknown) =>
  JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const reply = (c: any, data: unknown) => c.body(json(data), 200, { "content-type": "application/json" });

app.use("/graphql", graphql({ db, schema }));

/** Every market with its most recent snapshot — what the site's market list is drawn from. */
app.get("/board", async (c) => {
  const markets = await db.select().from(schema.market);
  const rows = [];
  for (const m of markets) {
    const [snap] = await db
      .select()
      .from(schema.snapshot)
      .where(eq(schema.snapshot.marketId, m.id))
      .orderBy(desc(schema.snapshot.timestamp))
      .limit(1);
    rows.push({ market: m, snapshot: snap ?? null });
  }
  return reply(c, rows);
});

app.get("/vaults", async (c) => {
  const vaults = await db.select().from(schema.vault);
  const allocations = await db.select().from(schema.vaultAllocation);
  return reply(
    c,
    vaults.map((v) => ({
      vault: v,
      allocations: allocations.filter((a) => a.vault.toLowerCase() === v.id.toLowerCase()),
    })),
  );
});

/** The keeper's input: every position carrying debt, cheapest possible shape. */
app.get("/positions/open", async (c) => {
  const rows = await db
    .select()
    .from(schema.position)
    .where(gt(schema.position.borrowShares, 0n));
  return reply(c, rows);
});

app.get("/portfolio/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  const [positions, events, score] = await Promise.all([
    db.select().from(schema.position).where(eq(schema.position.user, address)),
    db
      .select()
      .from(schema.txEvent)
      .where(eq(schema.txEvent.user, address))
      .orderBy(desc(schema.txEvent.timestamp))
      .limit(100),
    db.select().from(schema.creditScore).where(eq(schema.creditScore.id, address)),
  ]);
  return reply(c, { address, positions, events, score: score[0] ?? null });
});

app.get("/market/:id/series", async (c) => {
  const id = c.req.param("id") as `0x${string}`;
  const since = Number(c.req.query("since") ?? 0);
  const rows = await db
    .select()
    .from(schema.snapshot)
    .where(and(eq(schema.snapshot.marketId, id), gt(schema.snapshot.timestamp, since)))
    .orderBy(desc(schema.snapshot.timestamp))
    .limit(2000);
  return reply(c, rows.reverse());
});

app.get("/liquidations", async (c) => {
  const rows = await db
    .select()
    .from(schema.liquidation)
    .orderBy(desc(schema.liquidation.timestamp))
    .limit(200);
  return reply(c, rows);
});

/** Feed vs pool, most recent first — the series the oracle watchdog alerts from. */
app.get("/oracle/divergence", async (c) => {
  const rows = await db
    .select()
    .from(schema.feedTick)
    .orderBy(desc(schema.feedTick.timestamp))
    .limit(500);
  return reply(c, rows);
});

/** Volume each builder claims to have routed, most first. A claim, not a proof — see the SDK. */
app.get("/builders", async (c) => {
  const rows = await db.select().from(schema.builder).orderBy(desc(schema.builder.referredVolume));
  return reply(c, rows);
});

app.get("/stats", async (c) => {
  const [markets, vaults, liquidations] = await Promise.all([
    db.select().from(schema.market),
    db.select().from(schema.vault),
    db.select().from(schema.liquidation),
  ]);
  const totalSupply = markets.reduce((a, m) => a + m.totalSupplyAssets, 0n);
  const totalBorrow = markets.reduce((a, m) => a + m.totalBorrowAssets, 0n);
  return reply(c, {
    marketCount: markets.length,
    vaultCount: vaults.length,
    totalSupplyAssets: totalSupply,
    totalBorrowAssets: totalBorrow,
    liquidity: totalSupply - totalBorrow,
    interestAccrued: markets.reduce((a, m) => a + m.interestAccrued, 0n),
    liquidationCount: liquidations.length,
    badDebt: markets.reduce((a, m) => a + m.badDebtAssets, 0n),
  });
});

export default app;
