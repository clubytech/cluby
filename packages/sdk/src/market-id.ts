import { encodeAbiParameters, keccak256 } from "viem";

export type MarketParams = {
  loanToken: `0x${string}`;
  collateralToken: `0x${string}`;
  oracle: `0x${string}`;
  irm: `0x${string}`;
  lltv: bigint;
};

/**
 * Morpho's market id: keccak256 of the abi-encoded params. Deterministic, so a market's id is
 * known before it is created — which is what lets the deploy script, the indexer and the site
 * agree on an id without anyone reading it back off chain.
 */
export function marketId(params: MarketParams): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "loanToken", type: "address" },
        { name: "collateralToken", type: "address" },
        { name: "oracle", type: "address" },
        { name: "irm", type: "address" },
        { name: "lltv", type: "uint256" },
      ],
      [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
    ),
  );
}
