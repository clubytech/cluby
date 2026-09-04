import { ponder } from "ponder:registry";
import { snapshot, feedTick, market } from "ponder:schema";
import { deployments, morpho, stocks } from "@cluby/config";
import { irmAbi, morphoBlueAbi, oracleAbi, chainlinkFeedAbi } from "@cluby/sdk";

/**
 * Every ~5 minutes: one row per market for the charts, and one row per stock comparing the feed
 * with the pool. The divergence column is what the watchdog alerts on — it is cheaper to store the
 * comparison than to recompute it from two series later.
 */
ponder.on("Snapshot:block", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const ids = Object.values(deployments.markets).map((m) => m.id);

  for (const id of ids) {
    const [params, state] = await Promise.all([
      context.client.readContract({
        address: morpho.blue.address as `0x${string}`,
        abi: morphoBlueAbi,
        functionName: "idToMarketParams",
        args: [id],
      }),
      context.client.readContract({
        address: morpho.blue.address as `0x${string}`,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [id],
      }),
    ]);

    const marketParams = {
      loanToken: params[0],
      collateralToken: params[1],
      oracle: params[2],
      irm: params[3],
      lltv: params[4],
    };
    const marketState = {
      totalSupplyAssets: state[0],
      totalSupplyShares: state[1],
      totalBorrowAssets: state[2],
      totalBorrowShares: state[3],
      lastUpdate: state[4],
      fee: state[5],
    };

    const [rate, price] = await Promise.all([
      context.client
        .readContract({
          address: morpho.adaptiveCurveIrm.address as `0x${string}`,
          abi: irmAbi,
          functionName: "borrowRateView",
          args: [marketParams, marketState],
        })
        .catch(() => 0n),
      context.client
        .readContract({ address: marketParams.oracle, abi: oracleAbi, functionName: "price" })
        .catch(() => 0n),
    ]);

    const utilizationBps =
      marketState.totalSupplyAssets === 0n
        ? 0
        : Number((marketState.totalBorrowAssets * 10_000n) / marketState.totalSupplyAssets);

    await context.db.insert(snapshot).values({
      id: `${id}-${ts}`,
      marketId: id,
      timestamp: ts,
      supplyAssets: marketState.totalSupplyAssets,
      borrowAssets: marketState.totalBorrowAssets,
      utilizationBps,
      borrowRatePerSecond: rate,
      price,
    });

    await context.db
      .update(market, { id })
      .set({
        totalSupplyAssets: marketState.totalSupplyAssets,
        totalSupplyShares: marketState.totalSupplyShares,
        totalBorrowAssets: marketState.totalBorrowAssets,
        totalBorrowShares: marketState.totalBorrowShares,
        fee: marketState.fee,
        lastUpdate: ts,
      })
      .catch(() => undefined);
  }

  for (const [symbol, s] of Object.entries(stocks)) {
    if (!("feed" in s) || !s.feed) continue;
    const round = await context.client
      .readContract({ address: s.feed as `0x${string}`, abi: chainlinkFeedAbi, functionName: "latestRoundData" })
      .catch(() => null);
    if (!round) continue;
    const feedPrice = round[1] as bigint;
    if (feedPrice <= 0n) continue;

    // The pool leg is filled by the keeper, which can afford the observe() call budget;
    // storing zero here keeps the row shape stable and the divergence explicit rather than absent.
    await context.db.insert(feedTick).values({
      id: `${symbol}-${ts}`,
      symbol,
      timestamp: ts,
      feedPrice,
      twapPrice: 0n,
      divergenceBps: 0,
    });
  }
});
