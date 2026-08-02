"use client";

import Link from "next/link";
import { Wordmark } from "./Logo";
import { ConnectWalletButton } from "./ConnectWalletButton";

export function Nav() {
  return (
    <nav className="flex items-center justify-between border-b border-border bg-surface px-12 py-5">
      <Link href="/">
        <Wordmark size={19} />
      </Link>
      <div className="flex items-center gap-8">
        <Link href="/" className="cursor-pointer text-sm font-medium text-muted">
          Markets
        </Link>
        <span className="cursor-pointer text-sm font-medium text-muted">
          Portfolio
        </span>
        <span className="cursor-pointer text-sm font-medium text-muted">
          Docs
        </span>
        <ConnectWalletButton />
      </div>
    </nav>
  );
}
