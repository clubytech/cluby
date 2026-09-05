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

/**
 * Did the CHAIN refuse, or did the connection?
 *
 * The difference decides whether a human should be woken up. A revert is the contract telling us
 * something is wrong and it will still be wrong in ten seconds; an HTTP failure or a rate limit is
 * the free node being busy, and it clears by itself. Both arrive here as an exception, and treating
 * them the same is how a monitor teaches its operator to ignore it.
 */
export function isTransport(e: unknown): boolean {
  if (e instanceof BaseError) {
    // A decoded revert is never transport, whatever else is in the cause chain.
    if (e.walk((err) => err instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError) {
      return false;
    }
    const name = e.name ?? "";
    if (
      name === "HttpRequestError" ||
      name === "TimeoutError" ||
      name === "RpcRequestError" ||
      name === "InternalRpcError" ||
      name === "LimitExceededRpcError" ||
      name === "UnknownRpcError"
    ) {
      return true;
    }
    const walked = e.walk((err) => {
      const n = (err as Error)?.name ?? "";
      return n === "HttpRequestError" || n === "TimeoutError" || n === "LimitExceededRpcError";
    });
    if (walked) return true;
  }
  const msg = (e as Error)?.message ?? String(e);
  return /RPC Request failed|fetch failed|timed out|Too Many Requests|429|socket hang up|ECONNRESET|ETIMEDOUT/i.test(
    msg,
  );
}
