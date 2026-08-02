"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { costonTwo } from "@/lib/chain";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (isConnected && address) {
    const wrongNetwork = chainId !== costonTwo.id;

    if (wrongNetwork) {
      return (
        <button
          onClick={() => switchChain({ chainId: costonTwo.id })}
          className="rounded-lg bg-negative px-5 py-2.5 text-sm font-semibold text-white"
        >
          Switch to Coston2
        </button>
      );
    }

    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-border bg-surface px-5 py-2.5 font-mono text-sm font-medium text-text"
        title="Click to disconnect"
      >
        {truncateAddress(address)}
      </button>
    );
  }

  const injectedConnector = connectors[0];

  return (
    <button
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
      disabled={isPending || !injectedConnector}
      className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
    >
      {isPending
        ? "Connecting…"
        : injectedConnector
          ? "Connect wallet"
          : "No wallet detected"}
    </button>
  );
}
