import { encodeFunctionData, maxUint256, type Address } from "viem";
import { morpho } from "@cluby/config";
import { erc20Abi, morphoBlueAbi, uniswapV3PoolAbi, vaultAbi } from "./abi.ts";
import type { MarketParams } from "./market-id.ts";

const BLUE = morpho.blue.address as Address;

export type Call = { to: Address; data: `0x${string}`; value: bigint };

const call = (to: Address, data: `0x${string}`): Call => ({ to, data, value: 0n });

export const approve = (token: Address, spender: Address, amount = maxUint256) =>
  call(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }));

/** Post collateral. Nothing is borrowed by this call — it only makes borrowing possible. */
export const supplyCollateral = (params: MarketParams, amount: bigint, onBehalf: Address) =>
  call(
    BLUE,
    encodeFunctionData({
      abi: morphoBlueAbi,
      functionName: "supplyCollateral",
      args: [params, amount, onBehalf, "0x"],
    }),
  );

export const withdrawCollateral = (params: MarketParams, amount: bigint, onBehalf: Address, receiver: Address) =>
  call(
    BLUE,
    encodeFunctionData({
      abi: morphoBlueAbi,
      functionName: "withdrawCollateral",
      args: [params, amount, onBehalf, receiver],
    }),
  );

export const borrow = (params: MarketParams, assets: bigint, onBehalf: Address, receiver: Address) =>
  call(
    BLUE,
    encodeFunctionData({ abi: morphoBlueAbi, functionName: "borrow", args: [params, assets, 0n, onBehalf, receiver] }),
  );

/**
 * Repay. Pass shares rather than assets to close a debt exactly: interest accrues between the
 * moment the amount is quoted and the moment the transaction lands, so an assets-denominated repay
 * of "everything" always leaves dust behind.
 */
export const repay = (params: MarketParams, { assets = 0n, shares = 0n }, onBehalf: Address) =>
  call(
    BLUE,
    encodeFunctionData({ abi: morphoBlueAbi, functionName: "repay", args: [params, assets, shares, onBehalf, "0x"] }),
  );

export const supply = (params: MarketParams, assets: bigint, onBehalf: Address) =>
  call(
    BLUE,
    encodeFunctionData({ abi: morphoBlueAbi, functionName: "supply", args: [params, assets, 0n, onBehalf, "0x"] }),
  );

export const withdraw = (params: MarketParams, assets: bigint, onBehalf: Address, receiver: Address) =>
  call(
    BLUE,
    encodeFunctionData({ abi: morphoBlueAbi, functionName: "withdraw", args: [params, assets, 0n, onBehalf, receiver] }),
  );

export const vaultDeposit = (vault: Address, assets: bigint, receiver: Address) =>
  call(vault, encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [assets, receiver] }));

export const vaultWithdraw = (vault: Address, assets: bigint, receiver: Address, owner: Address) =>
  call(vault, encodeFunctionData({ abi: vaultAbi, functionName: "withdraw", args: [assets, receiver, owner] }));

/** Raise a pool's observation cardinality so a TWAP window of the length we need can exist. */
export const increaseCardinality = (pool: Address, next: number) =>
  call(
    pool,
    encodeFunctionData({ abi: uniswapV3PoolAbi, functionName: "increaseObservationCardinalityNext", args: [next] }),
  );

/**
 * The plain borrow flow, in the order a wallet should be asked to sign it: approve only when the
 * allowance is short, then collateral, then the loan.
 */
export function openPositionCalls(args: {
  params: MarketParams;
  collateral: bigint;
  borrowAssets: bigint;
  user: Address;
  currentAllowance: bigint;
}): Call[] {
  const calls: Call[] = [];
  if (args.currentAllowance < args.collateral) calls.push(approve(args.params.collateralToken, BLUE));
  calls.push(supplyCollateral(args.params, args.collateral, args.user));
  if (args.borrowAssets > 0n) calls.push(borrow(args.params, args.borrowAssets, args.user, args.user));
  return calls;
}
