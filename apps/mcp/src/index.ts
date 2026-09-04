#!/usr/bin/env node
/**
 * Cluby MCP server: markets, positions and pre-trade quotes over stdio.
 *
 * It reads. It does not sign anything and holds no key — an agent that wants to act gets the
 * numbers here and the transaction from a wallet its user controls. That boundary is the point:
 * everything below can be run against a live protocol without anyone having to trust it.
 *
 *   CLUBY_RPC_URL=<archive rpc> node --experimental-strip-types apps/mcp/src/index.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fromIndexer } from "./chain.ts";
import {
  describeMarket,
  describePosition,
  describeVaults,
  listMarketDefs,
  protocolFacts,
  quoteBorrow,
  quoteMultiply,
} from "./markets.ts";

const server = new McpServer({ name: "cluby", version: "0.1.0" });

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) }],
});

server.tool(
  "list_markets",
  "Every Cluby market: collateral, loan asset, liquidation LTV, live price, rates and whether it exists on chain yet.",
  { side: z.enum(["long", "short", "all"]).default("all").describe("Long borrows against collateral; short borrows the stock itself.") },
  async ({ side }) => {
    const defs = listMarketDefs().filter((m) => side === "all" || m.side === side);
    return json(await Promise.all(defs.map(describeMarket)));
  },
);

server.tool(
  "get_market",
  "One market in detail, by key (NVDA, SPY, ETH, NVDA-SHORT …).",
  { key: z.string().describe("Market key, case-insensitive") },
  async ({ key }) => {
    const def = listMarketDefs().find((m) => m.key.toLowerCase() === key.toLowerCase());
    if (!def) throw new Error(`no market called ${key}`);
    return json(await describeMarket(def));
  },
);

server.tool(
  "get_position",
  "A borrower's position in one market: collateral, debt, health factor and the price at which it is liquidated.",
  {
    market: z.string().describe("Market key"),
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Borrower address"),
  },
  async ({ market, address }) => json(await describePosition(market, address as `0x${string}`)),
);

server.tool(
  "quote_borrow",
  "What a borrow would do before it is signed: health factor, liquidation price, and whether it exceeds the cap the app enforces.",
  {
    market: z.string(),
    collateralAmount: z.number().positive().describe("Collateral in whole tokens"),
    borrowAmount: z.number().nonnegative().describe("Loan asset in whole units (USDG)"),
  },
  async ({ market, collateralAmount, borrowAmount }) =>
    json(await quoteBorrow(market, collateralAmount, borrowAmount)),
);

server.tool(
  "quote_multiply",
  "A leveraged position before it is opened: exposure, debt, resulting LTV, health factor and liquidation price.",
  {
    market: z.string(),
    equityUsd: z.number().positive().describe("What the user puts in, in USD"),
    leverage: z.number().min(1).describe("Target multiple of exposure to equity"),
  },
  async ({ market, equityUsd, leverage }) => json(await quoteMultiply(market, equityUsd, leverage)),
);

server.tool("list_vaults", "The Earn side: vaults, what they hold, their fee and timelock.", {}, async () =>
  json(await describeVaults()),
);

server.tool(
  "protocol_facts",
  "Addresses, fee split, LLTV tiers and how to take a free Morpho flash loan.",
  {},
  async () => json(protocolFacts()),
);

server.tool(
  "recent_liquidations",
  "Liquidations the indexer has seen. Requires CLUBY_INDEXER_URL; returns an empty list without it.",
  {},
  async () => json((await fromIndexer<unknown[]>("/liquidations")) ?? []),
);

server.tool(
  "market_history",
  "Supply, borrow, utilization and price over time for one market. Requires CLUBY_INDEXER_URL.",
  { market: z.string(), sinceUnix: z.number().optional() },
  async ({ market, sinceUnix }) => {
    const def = listMarketDefs().find((m) => m.key.toLowerCase() === market.toLowerCase());
    if (!def) throw new Error(`no market called ${market}`);
    const { deployments } = await import("@cluby/config");
    const id = deployments.markets[def.key]?.id;
    if (!id) throw new Error(`${def.key} is not created on chain yet`);
    return json((await fromIndexer<unknown[]>(`/market/${id}/series?since=${sinceUnix ?? 0}`)) ?? []);
  },
);

await server.connect(new StdioServerTransport());
