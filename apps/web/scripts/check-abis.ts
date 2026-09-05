/**
 * Every contract call the apps make, encoded against the ABI they will use.
 *
 * This exists because a gap in an ABI fails silently in both directions and looks like two
 * unrelated bugs. `morphoBlueAbi` was missing `setAuthorization` and `isAuthorized`: the READ threw
 * inside wagmi and resolved to undefined, so the Multiply panel concluded you had never authorised
 * the router and offered a button; the WRITE behind that button then could not encode its own call
 * and failed with "Function not found on ABI" — after the user had already clicked. Nothing in a
 * typecheck or a build catches that, because the function name is a string.
 *
 * Run it:  pnpm --filter @cluby/web check:abis
 */
import { encodeFunctionData } from "viem";
import { erc20Abi, morphoBlueAbi, oracleAbi, uniswapV3PoolAbi, vaultAbi } from "@cluby/sdk";
import { flashLiquidatorAbi, leverageRouterAbi, lensAbi } from "@cluby/abi";

const A = "0x0000000000000000000000000000000000000005" as const;
const B32 = `0x${"00".repeat(32)}` as const;
const P = {
  loanToken: A,
  collateralToken: A,
  oracle: A,
  irm: A,
  lltv: 1n,
} as const;

type Case = [abi: readonly unknown[], label: string, fn: string, args: readonly unknown[]];

const cases: Case[] = [
  // Morpho Blue: the whole surface the site and the SDK touch.
  [morphoBlueAbi, "morpho", "supply", [P, 1n, 0n, A, "0x"]],
  [morphoBlueAbi, "morpho", "withdraw", [P, 1n, 0n, A, A]],
  [morphoBlueAbi, "morpho", "borrow", [P, 1n, 0n, A, A]],
  [morphoBlueAbi, "morpho", "repay", [P, 1n, 0n, A, "0x"]],
  [morphoBlueAbi, "morpho", "supplyCollateral", [P, 1n, A, "0x"]],
  [morphoBlueAbi, "morpho", "withdrawCollateral", [P, 1n, A, A]],
  [morphoBlueAbi, "morpho", "setAuthorization", [A, true]],
  [morphoBlueAbi, "morpho", "isAuthorized", [A, A]],
  [morphoBlueAbi, "morpho", "accrueInterest", [P]],
  [morphoBlueAbi, "morpho", "flashLoan", [A, 1n, "0x"]],
  [morphoBlueAbi, "morpho", "market", [B32]],
  [morphoBlueAbi, "morpho", "position", [B32, A]],
  [morphoBlueAbi, "morpho", "idToMarketParams", [B32]],

  // ERC-20, as the panels use it.
  [erc20Abi, "erc20", "approve", [A, 1n]],
  [erc20Abi, "erc20", "allowance", [A, A]],
  [erc20Abi, "erc20", "balanceOf", [A]],
  [erc20Abi, "erc20", "decimals", []],
  [erc20Abi, "erc20", "symbol", []],

  // The vault surface behind Earn.
  [vaultAbi, "vault", "deposit", [1n, A]],
  [vaultAbi, "vault", "withdraw", [1n, A, A]],
  [vaultAbi, "vault", "redeem", [1n, A, A]],
  [vaultAbi, "vault", "maxWithdraw", [A]],
  [vaultAbi, "vault", "convertToAssets", [1n]],
  [vaultAbi, "vault", "totalAssets", []],

  // Oracles and pools.
  [oracleAbi, "oracle", "price", []],
  [uniswapV3PoolAbi, "pool", "slot0", []],

  // Our own periphery, from the generated ABIs.
  [lensAbi, "lens", "userView", [P, A, 0n]],
  [lensAbi, "lens", "marketView", [P]],
  [flashLiquidatorAbi, "liquidator", "maxSlippageWad", []],
  [flashLiquidatorAbi, "liquidator", "keepers", [A]],
  [leverageRouterAbi, "router", "open", [{ marketParams: P, equityCollateral: 1n, flashAmount: 1n, swapFee: 500, minCollateralOut: 1n, onBehalf: A }]],
  [leverageRouterAbi, "router", "close", [{ marketParams: P, repayAmount: 0n, repayShares: 1n, collateralToSell: 1n, swapFee: 500, minLoanOut: 1n, onBehalf: A, flashAmount: 1n }]],
];

let failed = 0;
for (const [abi, label, fn, args] of cases) {
  try {
    // viem's generics cannot narrow across a heterogeneous table of ABIs, and the point here is the
    // runtime answer, not the type: does this call encode against this ABI, yes or no.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (encodeFunctionData as any)({ abi, functionName: fn, args });
  } catch (e) {
    failed++;
    console.error(`  MISSING  ${label}.${fn} — ${String((e as Error).message).split("\n")[0]}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${cases.length} calls cannot be encoded. Something the app does will fail at click time.`);
  process.exit(1);
}
console.log(`all ${cases.length} calls encode`);
