import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";
import { desc, eq } from "ponder";

const app = new Hono();
const json = (data: unknown) => JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const reply = (c: any, data: unknown) => c.body(json(data), 200, { "content-type": "application/json" });

// GraphQL for the web app and keeper
app.use("/graphql", graphql({ db, schema }));

// Board: latest snapshot per market, plain JSON for bots and quick checks
app.get("/board", async (c) => {
  const markets = await db.select().from(schema.market);
  const rows = [];
  for (const m of markets) {
    const [snap] = await db
      .select()
      .from(schema.snapshot)
      .where(eq(schema.snapshot.marketId, m.id))
      .orderBy(desc(schema.snapshot.ts))
      .limit(1);
    rows.push({ market: m, snapshot: snap ?? null });
  }
  return reply(c, rows);
});

// Open borrow positions (keeper input)
app.get("/positions/open", async (c) => {
  const rows = await db.select().from(schema.position);
  return reply(c, rows.filter((p) => p.borrowShares > 0n));
});

export default app;
