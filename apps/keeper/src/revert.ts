import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * The name and arguments of a custom error, pulled out of whatever viem wrapped it in.
 *
 * `e.message.split("\n")[0]` — and `e.shortMessage`, which is byte-for-byte the same string —
 * return "The contract function \"liquidate\" reverted." and stop. The one thing worth reading,
 * `NotKeeper()` or `NoProfit(502000000, 505000000)`, is on the second line, and neither of those
 * two ever reaches a log. So walk the cause chain to the decoded error instead of scraping prose.
 */
export function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason;
      const args = revert.data?.args;
      if (name) return args && args.length > 0 ? `${name}(${args.join(", ")})` : name;
    }
    return e.shortMessage;
  }
  return (e as Error)?.message?.split("\n")[0] ?? String(e);
}
