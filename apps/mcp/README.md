# MCP server

Cluby's markets, positions and pre-trade quotes, over stdio.

```sh
CLUBY_RPC_URL=<rpc> CLUBY_INDEXER_URL=http://localhost:42069 pnpm --filter @cluby/mcp start
```

`CLUBY_INDEXER_URL` is optional — history and liquidations come from the indexer, everything about
the present comes from the chain.

| Tool | Answers |
|---|---|
| `list_markets` | every market, with price, rates and whether it exists on chain |
| `get_market` | one market in detail |
| `get_position` | a borrower's collateral, debt, health factor and liquidation price |
| `quote_borrow` | what a borrow would do, and whether it exceeds the cap the app enforces |
| `quote_multiply` | exposure, debt, LTV, health factor and liquidation price of a leveraged position |
| `list_vaults` | the Earn side, with fee and timelock |
| `protocol_facts` | addresses, fee split, LLTV tiers, how to take a free flash loan |
| `recent_liquidations`, `market_history` | from the indexer |

## It reads, and only reads

There is no signing here and no key. An agent gets the numbers from this server and the transaction
from a wallet its user controls. That is what makes it safe to point at a live protocol: the worst
a compromised client can do is read public state it could have read anyway.

The quotes come from the same `@cluby/sdk` maths the site and the Lens contract use, so a health
factor quoted here is the one the transaction will produce — not an approximation of it.
