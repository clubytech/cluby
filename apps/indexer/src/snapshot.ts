import { ponder } from "ponder:registry";
import { snapshot, feedTick, market } from "ponder:schema";
import { createPublicClient, http } from "viem";
import { deployments, marketCatalog, morpho, robinhoodChain, stocks } from "@cluby/config";
import { irmAbi, morphoBlueAbi, oracleAbi, chainlinkFeedAbi } from "@cluby/sdk";

/**
 * State reads go to the archive endpoint explicitly, not through Ponder's client.
 *
 * Ponder is pointed at the public node, which serves wide log sweeps but is pruned — a historical
 * eth_call there fails. Routing by hand is the only way to have both: wide logs and old state.
 */
const archive = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.PONDER_RPC_URL_4663, {
    fetchOptions: { headers: { "user-agent": "cluby-indexer/1.0" } },
    retryCount: 2,
    timeout: 20_000,
  }),
});

const BLUE = morpho.blue.address as `0x${string}`;
const IRM = morpho.adaptiveCurveIrm.address as `0x${string}`;
const marketIds = Object.entries(deployments.markets).map(([key, m]) => ({ key, id: m.id as `0x${string}` }));

/** Only the assets our markets actually price. Reading every feed on the chain is wasted budget. */
const watchedFeeds = Object.entries(stocks)
  .filter(([symbol, s]) =>
    "feed" in s && s.feed && marketCatalog.some((m) => (m.side === "long" ? m.collateral : m.loan) === symbol && deployments.markets[m.key]),
  )
  .map(([symbol, s]) => ({ symbol, feed: s.feed as `0x${string}` }));

/**
 * Every ~5 minutes: one row per market for the charts, and one row per watched feed.
 *
 * Every read in a pass goes through Multicall3 as a single eth_call. One request per market instead
 * of six matters more than it sounds: the archive plan rate-limits, and a backfill that issues a
 * thousand separate reads never finishes.
 */
ponder.on("Snapshot:block", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  if (marketIds.length === 0) return;

  const paramsAndState = await archive
    .multicall({
      contracts: marketIds.flatMap(({ id }) => [
        { address: BLUE, abi: morphoBlueAbi, functionName: "idToMarketParams", args: [id] } as const,
        { address: BLUE, abi: morphoBlueAbi, functionName: "market", args: [id] } as const,
      ]),
      blockNumber,
      allowFailure: true,
    })
    .catch(() => null);
  // A snapshot is a nice-to-have; a failed one must not stop the indexer following the chain.
  if (!paramsAndState) return;

  type Live = {
    key: string;
    id: `0x${string}`;
    params: { loanToken: `0x${string}`; collateralToken: `0x${string}`; oracle: `0x${string}`; irm: `0x${string}`; lltv: bigint };
    state: { totalSupplyAssets: bigint; totalSupplyShares: bigint; totalBorrowAssets: bigint; totalBorrowShares: bigint; lastUpdate: bigint; fee: bigint };
  };

  const live: Live[] = [];
  marketIds.forEach(({ key, id }, i) => {
    const p = paramsAndState[i * 2];
    const s = paramsAndState[i * 2 + 1];
    if (p?.status !== "success" || s?.status !== "success") return;
    const pr = p.result as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint];
    // Before the market was created this reads back zeros, and an oracle at the zero address is an
    // error rather than a missing number.
    if (pr[4] === 0n) return;
    const sr = s.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    live.push({
      key,
      id,
      params: { loanToken: pr[0], collateralToken: pr[1], oracle: pr[2], irm: pr[3], lltv: pr[4] },
      state: {
        totalSupplyAssets: sr[0],
        totalSupplyShares: sr[1],
        totalBorrowAssets: sr[2],
        totalBorrowShares: sr[3],
        lastUpdate: sr[4],
        fee: sr[5],
      },
    });
  });

  if (live.length === 0) return;

  const ratesAndPrices = await archive
    .multicall({
      contracts: live.flatMap((m) => [
        { address: IRM, abi: irmAbi, functionName: "borrowRateView", args: [m.params, m.state] } as const,
        { address: m.params.oracle, abi: oracleAbi, functionName: "price" } as const,
      ]),
      blockNumber,
      allowFailure: true,
    })
    .catch(() => null);

  for (const [i, m] of live.entries()) {
    const rate = ratesAndPrices?.[i * 2];
    const price = ratesAndPrices?.[i * 2 + 1];

    const utilizationBps =
      m.state.totalSupplyAssets === 0n
        ? 0
        : Number((m.state.totalBorrowAssets * 10_000n) / m.state.totalSupplyAssets);

    await context.db.insert(snapshot).values({
      id: `${m.id}-${ts}`,
      marketId: m.id,
      timestamp: ts,
      supplyAssets: m.state.totalSupplyAssets,
      borrowAssets: m.state.totalBorrowAssets,
      utilizationBps,
      borrowRatePerSecond: rate?.status === "success" ? (rate.result as bigint) : 0n,
      price: price?.status === "success" ? (price.result as bigint) : 0n,
    });

    await context.db
      .update(market, { id: m.id })
      .set({
        totalSupplyAssets: m.state.totalSupplyAssets,
        totalSupplyShares: m.state.totalSupplyShares,
        totalBorrowAssets: m.state.totalBorrowAssets,
        totalBorrowShares: m.state.totalBorrowShares,
        fee: m.state.fee,
        lastUpdate: ts,
      })
      .catch(() => undefined);
  }

  if (watchedFeeds.length === 0) return;
  const rounds = await archive
    .multicall({
      contracts: watchedFeeds.map(
        (f) => ({ address: f.feed, abi: chainlinkFeedAbi, functionName: "latestRoundData" }) as const,
      ),
      blockNumber,
      allowFailure: true,
    })
    .catch(() => null);
  if (!rounds) return;

  for (const [i, f] of watchedFeeds.entries()) {
    const r = rounds[i];
    if (r?.status !== "success") continue;
    const feedPrice = (r.result as readonly [bigint, bigint, bigint, bigint, bigint])[1];
    if (feedPrice <= 0n) continue;

    // The pool leg is the keeper's job — it can afford the observe() budget. Storing the row with a
    // zero there keeps the shape stable and the gap explicit rather than absent.
    await context.db.insert(feedTick).values({
      id: `${f.symbol}-${ts}`,
      symbol: f.symbol,
      timestamp: ts,
      feedPrice,
      twapPrice: 0n,
      divergenceBps: 0,
    });
  }
});
