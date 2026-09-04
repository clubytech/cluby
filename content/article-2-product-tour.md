# Inside Cluby: the whole protocol, feature by feature

Cluby is the credit layer for tokenized equities and the assets that trade beside them. Lend against a share, borrow the share itself, take leverage in either direction, and price all of it against an oracle that stays awake when the exchange closes.

This is the full tour.

## The foundation

Cluby does not run its own lending engine. Deposits, debt, collateral and liquidations sit inside Morpho Blue, immutable and audited to a standard no new codebase reaches. Nobody, including us, can upgrade those contracts or reach into a position.

Everything above that is ours: the markets, the oracles, the risk parameters, the routing, the interface. None of it takes custody. Routers hold no balance between transactions. The liquidator funds itself entirely from flash loans, which is why the protocol needs no treasury standing behind it. Parameters move on a timelock, and the only permissions held on a hot key are the ones that lower a cap or pause a market.

Your money sits in code that cannot change, and our code cannot touch it.

## Earning: vaults

Deposit into a vault, receive shares. The vault spreads your deposit across an approved list of markets under published caps, and pays you what borrowers pay, minus a performance fee.

There is more than one vault because there is more than one appetite.

**Core** takes only markets priced by first-party feeds, under conservative caps. It is the default.

**Frontier** takes the long tail, priced onchain, at the rate that risk earns.

**ETH** supplies ETH against stock collateral instead of stablecoins.

**Stock lending vaults**, one per ticker, hold the share itself and earn from the traders borrowing it.

**Partner vaults** are opened for a single project, funded by that project, with liquidity reserved for its own holders.

Each vault shows what it pays, what it holds, and what you can withdraw at this moment, because a vault's size and its free liquidity are different numbers and only one of them is the one you leave on.

## Borrowing: isolated markets

A market is one collateral against one loan asset, with its own oracle, its own liquidation threshold and its own cap. Markets are isolated, so a bad day in one stays in one. Parameters are fixed at creation and cannot be edited afterwards, ours included.

Markets are grouped so you can find them: tokenized stocks and ETFs, treasuries and other real-world assets, crypto majors, and assets native to the chain.

Every market page carries the live price, the liquidation threshold, a link to the exact oracle contract, the supply cap, the rate curve, and the full history of what has been supplied and borrowed. The interface holds a safe cap below the real threshold, so the panel will not quietly let you open a position pressed against the edge. You can override it. It tells you what you are doing first.

## Both sides of the stock

Alongside every market where a share is collateral, Cluby runs the mirror: stablecoin as collateral, the share as the borrowed asset. The debt is denominated in shares. You borrow the stock and sell it, which is a short on the asset rather than a synthetic tracking its price.

Two things follow.

Long and short live on the same venue, against the same liquidity, in one position view.

And a single deposit earns from two directions at once: interest from stablecoin borrowers, and the borrow fee paid by shorts. Nothing about how you deposit changes. The second revenue line is simply there.

The short interest board is public: how much of each ticker is borrowed short, how tight it is, what the fee is, how long it would take to cover, and how far the onchain price sits from the reference market.

## Leverage and flash loans

**Multiply** opens a leveraged position in one transaction. Collateral, flash loan, swap, supply and borrow, settled together. Before you sign, you see the resulting health factor and the exact price at which the position liquidates. Unwinding runs the same machinery in reverse.

**Flash loans** are open to anyone and cost nothing. They are not a revenue line. They are the rails the liquidator already runs on, and leaving them open costs less than defending a fee.

## How prices are set

Markets with a reliable first-party feed use it. Assets without one are priced from onchain trading over a long averaging window, expensive to move and simple to verify.

Then there is the weekend.

Tokenized shares trade continuously. The feeds behind them do not. When the reference exchange closes, a feed holds its last print for days while the token keeps moving. The usual answer is to accept the stale price, lend less against it, and post a monitor beside the protocol to watch for trouble.

Cluby prices collateral at the more conservative of the feed and the live onchain price. When the token falls while the exchange is shut, collateral value falls with it, in the same block. Stale-price arbitrage is not something the protocol watches for. It is something the protocol cannot express.

The consequence is the part you feel: more borrowing power against the same share, because the conservatism that used to pay for that risk is no longer buying anything.

Every market page states its pricing mode and links the contract.

## When a position moves against you

Standard onchain liquidation is binary. Fine, then not fine, and the penalty arrives at full size in one transaction. On an asset that gaps over a weekend, that is an expensive way to lose a position that was comfortable on Friday.

Every stock market on Cluby has graduated liquidation enabled at listing, not offered as an upgrade. Drift past the first threshold and the position is trimmed partially at a small penalty, well before the full one applies. You keep the position and most of the upside, and you pay for the drift instead of for everything.

Your position page carries both numbers side by side: the price where the soft trim begins, and the price where the hard one would.

Underneath, the watchdog compares every market's oracle against live trading on a short cycle, and tightens its tolerance over the weekend. A market that drifts out of tolerance has its cap set to zero and vault liquidity pulled out of it. That authority reduces exposure and nothing else. It cannot open a position, raise a cap or move a parameter.

## Your account

**Portfolio** holds deposits, open loans, health factor, liquidation price, rebates waiting to be claimed, and full history. Every action is simulated before you sign, so the numbers on screen are the numbers you get.

**Stats** covers the protocol: total value, available to borrow, collateral posted, market count, the vault book, and every market with its supply, borrow, rate and utilisation. It updates continuously.

**Credit score** reads a borrower from their own record: repayment consistency, volume, time active, spread of positions, and liquidation history. The methodology is published in full, the score is readable onchain, and it exists to make reliable borrowers cheaper to serve.

## Token, staking and rebates

Staking the protocol token pays in stablecoins, streamed by the second, with no lock. The rewards come out of protocol revenue, so the yield tracks activity rather than an emission schedule.

Borrowers get a share of the interest they paid returned each epoch. Borrowing on Cluby costs less than the headline rate, and that discount lands with the people using the protocol.

## For builders and for agents

**Builders** who route volume keep half of the performance fee it generates, and can add their own fee on top and keep all of it. Registration is a signature, attribution is automatic, and the share is permanent rather than a launch campaign.

**Agents** get a hosted MCP server: read tools for markets, positions and vault state, and build tools that return unsigned transactions for supply, borrow, repay, stake, claim and leverage. It holds no keys. Everything an agent prepares, you still sign.

## Sequencing

Lending against NFTs is a distinct risk model and it gets its own release rather than riding along inside this one. It is next on the roadmap.

## Terms for being early

The performance fee is zero for the first ninety days. Borrower rebates run from the first epoch. Projects on the chain can have a dedicated vault and market opened for their token. Early activity accrues points that convert retroactively.

## The short version

Everything a credit protocol on this chain does, Cluby does: isolated markets, curated vaults, leverage, free flash loans, live stats, agent access, a builder program.

Three things it does that no one else does. It lets you borrow the share as well as borrow against it, which pays the holder twice and gives the trader the other half of the market. It prices collateral through the weekend instead of freezing and hoping, which turns into borrowing power on every position. And it runs graduated liquidation from day one on exactly the assets most likely to gap.

Built on immutable infrastructure. Non-custodial end to end. Both sides of the stock, in one protocol.
