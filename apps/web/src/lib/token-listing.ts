import { cache } from "react";
import { deployments } from "@cluby/config";
import { tokenRegistryAbi } from "@cluby/abi";
import { publicClient } from "./chain";

export type TokenListing = {
  /** The published token, or null before launch. */
  token: `0x${string}` | null;
  /** A venue its price can be read from, if one was published. */
  pool: `0x${string}` | null;
  /** When it was published, as a unix timestamp. */
  listedAt: number;
  /** Read from the token itself, so the label cannot disagree with the contract. */
  symbol: string;
  decimals: number;
  totalSupply: bigint;
};

export const NOT_LAUNCHED: TokenListing = {
  token: null,
  pool: null,
  listedAt: 0,
  symbol: "",
  decimals: 0,
  totalSupply: 0n,
};

/**
 * What the site says the token is.
 *
 * Read from the chain on every render window rather than baked in at build time, because the point
 * of the registry is that the page changes the moment the owner's transaction lands — with no
 * deploy, no environment variable and no cache to bust by hand. `revalidate` on the pages that call
 * this is what bounds "the moment" (30 seconds today).
 *
 * Wrapped in React's `cache`, because the layout's header and the page's body both ask — one
 * render should not make the same call twice.
 *
 * A failure here returns "not launched" rather than throwing. Before launch that is also the true
 * answer, and after launch a page that renders without the address beats a page that does not
 * render — the address is repeated in the transaction the reader can look up themselves.
 */
export const getTokenListing = cache(async function getTokenListing(): Promise<TokenListing> {
  const registry = deployments.tokenRegistry;
  if (!registry) return NOT_LAUNCHED;

  try {
    const [token, pool, listedAt, symbol, decimals, totalSupply] = await publicClient.readContract({
      address: registry,
      abi: tokenRegistryAbi,
      functionName: "listing",
    });
    if (token === "0x0000000000000000000000000000000000000000") return NOT_LAUNCHED;
    return {
      token,
      pool: pool === "0x0000000000000000000000000000000000000000" ? null : pool,
      listedAt: Number(listedAt),
      symbol,
      decimals,
      totalSupply,
    };
  } catch {
    return NOT_LAUNCHED;
  }
});

/** "$CLUBY" once there is one, and the honest placeholder until then. */
export function ticker(listing: TokenListing): string {
  return listing.symbol ? `$${listing.symbol}` : "the token";
}
