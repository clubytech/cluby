# Cluby is live on Robinhood Chain

**cluby.cash**

Thirty-five isolated lending markets, live. Forty-three in the catalogue. Tokenized equities, index ETFs, commodities, treasuries and pre-IPO as collateral. Borrow against a stock, or borrow the stock itself.

None of it in our custody, and none of it upgradeable by us.

## Both sides of the stock, today

Every credit protocol built on tokenized equity answers one question: how do I borrow against something I am long.

**NVDA-SHORT and TSLA-SHORT are live.** Post USDG as collateral, borrow the share itself, sell it. The debt is denominated in shares. This is a real borrow of a real tokenized share, not a synthetic tracking a number, and it settles through the same lending primitive as everything else on the protocol.

They run an inverse oracle: the same price as the long market, read from the other direction, so a stock can be the borrowed asset instead of the collateral. Same feed, same trust, no second source that could disagree with the first.

Two markets is not a claim about scale. It is a claim that the other side of this asset class now exists onchain, and it did not last week.

## The collateral book

Most protocols in this category open with four megacaps and call it coverage.

**Megacaps and semis:** NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA, AMD, TSM, MU, SNDK
**Index ETFs:** SPY, QQQ
**Commodities as RWA:** SLV for silver, USO for oil
**Treasuries:** SGOV, the highest threshold tier on the protocol
**Pre-IPO:** SPCX
**Onchain-native:** WETH, PONS, CASHCAT
**Conviction names:** GME, MSTR, PLTR, CRCL, NFLX, RDDT, COST, DELL, BABA, ASML, INTC, USAR

Each is an isolated market with its own oracle, its own threshold and its own cap. A bad day in one cannot reach another.

## We did not write a lending protocol

Deposits, collateral, debt and liquidations sit inside Morpho Blue. Immutable, audited to a standard no new codebase reaches, and impossible for us to upgrade or reach into. The vault is a standard MetaMorpho vault from Morpho's own sources, unmodified. The pre-liquidation factory is theirs too, deployed from their sources because they had not deployed it on this chain.

What is ours is the curation layer: the oracles, the router, the liquidator, the data contract, the registries. All verified, all listed with their addresses in the docs.

The Safe owns the vault, the liquidator, the credit registry and the token registry. The deploy key owns nothing.

## The chain had to be enumerated before anything could be listed

There is no token list for tokenized equities on this chain. No directory, no registry, no subgraph. If you want to know what exists, you have to derive it.

Every Robinhood stock token is a proxy pointing at one shared implementation, and that is a fingerprint. Each deployment announces itself once, at creation, by naming the beacon it will follow. Scanning that single announcement across the chain's entire history enumerates the set: **203 tokenized equities**, found by construction rather than by asking anyone.

That scan is also where the traps are.

**Twelve of those tokens carry a display multiplier that is not one.** A token can hold one unit and show you four. Another shows 2.006. Another 1.0215. It is a presentation field. It has nothing to do with the balance. A protocol that reads it as a quantity misprices collateral by a factor of four and never finds out until a liquidation fails to clear.

We read balances raw and treat that field as text, which is the only safe reading of it.

If you are building on this chain, go and check those twelve yourself. It is the sharpest edge here and it is documented nowhere.

## The oracle is the product. Everything else is plumbing

A lending protocol is a bet that its price is right at the moment it matters. Ours comes from two places and never from a blend, because a blend is a third failure mode nobody tests.

**Chainlink, where a feed exists.** Twenty-seven markets. The feed is wrapped so the number arrives in exactly the form the lending primitive expects, decimals folded in, so no consumer has to remember which side of the pair it is on.

**A thirty-minute time-weighted average, where a feed does not.** Six markets. Not a spot price. Spot on a shallow pool is a suggestion, and buying it for one block costs less than the loan it would unlock. Thirty minutes of volume-weighted history costs more to move than anything it could release, and still tracks a genuine repricing inside half an hour.

Here is the part almost nobody does.

A pool can only answer a thirty-minute question if it has kept thirty minutes of answers, and by default it keeps about one. Extending that memory is permissionless, it is not free, and it is nobody's job, so it does not get done, and TWAP oracles get deployed against pools that cannot serve the window they claim.

**We bought the memory on every pool we price against, out of our own pocket, before the market opened.** Each of those rings now holds up to eighteen hundred observations.

And the oracle contract refuses to deploy against a pool whose memory is too short for its own window. It cannot be configured around. A market whose price would be a guess does not get created.

Note that the pricing tier and the risk tier are separate questions. Thirty-eight and a half percent is about depth, not about where the price comes from. ASML, INTC, PLTR, USAR and SPCX all sit at that threshold on Chainlink feeds.

## We took the lower number every time the chain would not give us the one we wanted

Morpho only accepts liquidation thresholds its own governance has enabled. On this chain that is nine specific values, and our risk plan asked for two that are not among them: seventy percent for TWAP-priced megacaps, and sixty-six and seven tenths for shorts.

Neither exists. Both were pinned to the nearest enabled value **below** the target, sixty-two and a half, and the plan was left as written rather than quietly redrawn around what happened to be available.

That is the conservative direction in both cases. A lower threshold liquidates earlier and lends less. The shorts run at 160% coverage instead of the 150% they were designed for.

| Tier | Threshold | Markets |
|---|---|---|
| Treasuries | 86% | 1 |
| ETH | 77% | 1 |
| Equities and index ETFs | 62.5% | 20 |
| Long tail | 38.5% | 11 |

A threshold is written into a market's identity, not into its storage. The address of a market is derived from its parameters, so changing one does not edit a market, it names a different market that does not exist.

**There is no governance path to your liquidation threshold, because there is no function that could be called.**

## What actually happens when a position goes bad, in order

**First, someone notices.** A keeper compares every oracle against live trading on the pool behind it, continuously. Those readings currently sit between zero and one hundred and twelve basis points apart, per market, and a divergence outside tolerance raises an alert to a human.

It raises an alert rather than acting, and that is the design rather than an unfinished feature.

**The keeper is not an allocator on the vault. It cannot set a cap, cannot move liquidity, cannot open a position, cannot change a parameter, and cannot touch anyone's funds.** The only write it is permitted is calling the liquidator on a position already underwater by the market's own arithmetic, and the liquidator holds nothing and can only close positions. Withdrawing a cap is a decision the Safe makes, in public, behind a twenty-four hour timelock.

The tempting version of this is a keeper that pulls liquidity automatically at three in the morning and tells you about it over breakfast. That is also a key on a server with the authority to drain a vault into a market of its own choosing. We would rather be woken up.

**Then a trim, not a seizure.** Pre-liquidation instances run on NVDA, SPY and ETH, the three markets the vault funds today, and one goes up on each new market as it gets liquidity. Drift past the first threshold and the position is trimmed partially at a small penalty, well before the full one applies.

It is opt-in. A borrower authorises it, and until they do, nothing about their position changes. Deploying one takes nothing away from anyone, it only makes the gentler path available.

**Then the full liquidation, and the incentive is arithmetic rather than policy.** The lending primitive derives the liquidator's bonus from the threshold itself:

| Tier | Liquidator's bonus | Collateral must sell for at least |
|---|---|---|
| Treasuries, 86% | 4.38% | 95.8% of oracle |
| ETH, 77% | 7.41% | 93.1% of oracle |
| Equities, 62.5% | 12.68% | 88.75% of oracle |
| Long tail, 38.5% | 15.00% | 86.96% of oracle |

**And our liquidator will not sell below a floor it reads from the oracle at the moment it acts.** It is not permitted to accept an arbitrarily bad swap in order to close a position. It computes what the collateral is worth, refuses anything more than eight percent below that, and reverts if the sale does not cover the repayment.

The failure mode of a liquidator with no floor is that it dumps collateral into a thin pool and hands the difference to whoever placed the other side. That is not a theoretical objection. It is the second most common way liquidation bots leak value.

The liquidator holds nothing between transactions. It borrows the repayment inside the transaction, repays the debt, takes the collateral, sells it, returns the loan and keeps the difference, all before the block ends. This is why the protocol needs no treasury standing behind liquidations, and why a liquidation never waits for someone to be rich enough to perform it.

## Nothing here can be upgraded, which is why we replace things instead

There is no proxy in front of anything we wrote. No admin can change our contracts' behaviour, because there is no mechanism by which behaviour could be changed.

That is a real constraint with a real cost, so here is what it looks like in practice. Our read-only data contract has been deployed **five times**. Each version was replaced rather than patched: the new address goes into the configuration and the old one is abandoned where it stands.

Every one of those replacements was free of risk to anyone's money, for one reason. **None of these contracts holds anything between transactions.** Routers keep no balance. The liquidator funds itself from a flash loan and ends every transaction empty. The data contract only reads.

A protocol that cannot be upgraded and holds nothing is a protocol where the worst version of us has nothing to steal and no lever to pull.

The most recent replacement is worth telling on ourselves.

A deploy done by hand, outside our own scripts, was handed an address that shared four leading bytes with the one it wanted and had no code at all. A call into an address with no code reverts with no error message, so every read failed silently, and monitoring reported it as a broken market rather than a broken deploy. No user funds were ever at risk, because the contract only reads, but liquidation monitoring on one market was blind until it was traced by hand.

Three things changed as a result, none of them "be more careful". The contract now refuses to deploy pointing at an address with no code. The deploy script takes the address from the configuration file rather than from a human, and calls a live market through the contract it just deployed before it will print an address worth pasting anywhere. And the same no-code check now guards the contract that will one day publish the token's address, where the consequence would not be a broken read but an address people send money to.

## Every number on the site is one you can fetch yourself

The site reads the chain and prints the contract next to the figure so you can check it.

Where a value is zero it says zero. Where a read fails it says the read failed. It does not round a failure down into a number, because a failed read and a genuine zero are different facts and only one of them is true.

The token page shows the rebate distributor's address, how much it is holding, how much it has paid, the vault's performance fee, and how long any change to that fee has to sit in public first. Today most of those are zero. The distributor is deployed, owned by the Safe, and has paid nothing, because the fee that would fund it is zero. That is what the page says.

One property of it is worth knowing: **the distributor refuses to publish a week it cannot pay for.** The money goes in first, then the claim list. There is no ordering in which a promised rebate outruns the balance behind it, and no week where claiming early beats claiming late.

## Fees, and what being early is actually worth

**The performance fee is zero.** Not discounted, not introductory with conditions. Zero, as a vault parameter. Raising it sits in public behind the twenty-four hour timelock, onchain, where anyone can watch it happen. A timelock without a duration is not a commitment, so there is the number.

**Builders keep half the performance fee** on volume they route, and can stack their own fee on top and keep all of that. Half of zero is zero, so today the honest version is this: the integration, the referrer tag and the accounting are live and working, and the share becomes worth money the day the fee turns on. Register now and you are attributed from the first transaction rather than from whenever you notice.

## Start small, on purpose

Caps on new markets start deliberately low and rise only against measured exit liquidity, never against enthusiasm. A cap larger than the pool behind it is a promise the exit cannot keep.

Total value in the vault is about one dollar. This post makes no claim about TVL and it is not going to start. **This is the canary phase and that number is what the phrase describes.** The markets are live, the parameters are public, the contracts are verified, and the book grows at the speed the depth justifies.

Two more disclosures, because you would find them anyway. The vault has no guardian and no curator set today, and its owner is the Safe. We are not going to tell you a guardian can veto something until one exists.

## What ships next

**Stock lending vaults**, one per ticker, so a holder can supply the share to short sellers without choosing a market by hand, and earn the borrow fee alongside the interest.

**A public short interest board**: utilisation, borrow fee, days to cover, and premium to the reference market, per ticker. That data has never existed for tokenized equity anywhere.

**The launchpad.** Issue a token, seed the pool, extend its observation memory and open a market against it in one flow. A token becomes useful the moment someone will lend against it, and today that takes weeks of asking a curator. Partner vaults already work without waiting for it: one market, your cap, your liquidity, ownership handed to you in the transaction that creates it.

**On NFT lending, the honest answer.** We enumerated the chain: no NFT collection on it has any price source, not a feed, not a pool, not a wrapper. Nothing oracle-priced can be built here yet. If it ships, it ships peer to peer with the token in escrow and a fixed deadline, and we will say so rather than implying an oracle exists.

## Start here if you are going to check us

- The Safe owns the vault, the liquidator, the credit registry and the token registry. The deploy key owns nothing.
- The lending primitive is Morpho Blue's own deployment. It is not ours.
- The vault is a standard MetaMorpho vault from Morpho's sources, unmodified.
- The pre-liquidation factory is Morpho's, deployed from their sources because they had not deployed it here.
- Everything else, the oracles, router, liquidator, data contract and registries, is ours, verified, and listed with its address in the docs.

Read *What breaks, and what happens then* first. It is the section that says what we do not control: that a feed can go stale, that a thin pool can be moved, that a weekend gap can outrun a keeper, and what each of those costs you.

A protocol that will not write that section has not thought about it. A protocol that writes it and then buries it did not mean it.

**cluby.cash**

Thirty-five markets. Both sides of the stock. The credit layer for tokenized equities on Robinhood Chain.
