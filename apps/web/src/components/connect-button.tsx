"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@cluby/config";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const injectedConnector = connectors[0];

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={isPending || !injectedConnector}
        className={`rounded-full bg-brand-bright px-5 py-2 text-sm font-medium text-bg-deep transition-colors hover:bg-white disabled:opacity-60 ${
          compact ? "" : "px-6 py-3"
        }`}
      >
        {isPending ? "Check your wallet…" : injectedConnector ? "Connect wallet" : "No wallet found"}
      </button>
    );
  }

  // Connected but pointed somewhere else: signing here would do nothing useful, so say so first.
  if (chainId !== robinhoodChain.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
        className="rounded-full bg-warn px-5 py-2 text-sm font-medium text-bg-deep"
      >
        Switch to Robinhood Chain
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title="Disconnect"
      className="num rounded-full border border-line-dark px-4 py-2 text-sm text-text-white hover:bg-white/10"
    >
      {short(address!)}
    </button>
  );
}
