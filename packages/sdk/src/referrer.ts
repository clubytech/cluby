import type { Address, Hex } from "viem";
import { getAddress, isAddress } from "viem";

/**
 * Builder attribution by calldata suffix.
 *
 * Solidity's ABI decoder ignores bytes past the end of the arguments it expects, so twenty bytes
 * appended to a call reach the chain, cost only calldata gas, and change nothing about how the call
 * executes. The indexer reads them back off the transaction input.
 *
 * The alternative — a referrer argument — would mean wrapping every Morpho entry point in a
 * contract of ours, putting our code in the path of every deposit and loan to collect a marketing
 * statistic. This costs 320 gas and no trust.
 */
export function appendReferrer(data: Hex, builder: Address): Hex {
  return `${data}${builder.slice(2).toLowerCase()}` as Hex;
}

/**
 * The referrer a transaction carried, if any.
 *
 * A suffix proves nothing by itself — anyone may append any address to their own transaction — so
 * this only reports what was claimed. Whether a claim is paid is decided against the registered
 * builder list, off chain, where it can be revoked.
 */
export function referrerFromCalldata(input: Hex): Address | null {
  if (input.length < 2 + 8 + 40) return null;
  const tail = `0x${input.slice(-40)}`;
  if (!isAddress(tail)) return null;
  const address = getAddress(tail);
  if (address === "0x0000000000000000000000000000000000000000") return null;
  // Argument words are 32 bytes and left-padded, so a genuine trailing argument ends in zeros far
  // more often than not; a suffix that is exactly a 20-byte address in the last slot is the signal.
  const wordsOnly = (input.length - 10) % 64 === 0;
  return wordsOnly ? null : address;
}
