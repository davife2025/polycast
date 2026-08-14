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
        <Link href="/" className="text-sm font-medium text-muted hover:text-text">
          Markets
        </Link>
        <Link href="/portfolio" className="text-sm font-medium text-muted hover:text-text">
          Portfolio
        </Link>
        <Link
          href="/markets/create"
          className="text-sm font-medium text-muted hover:text-text"
        >
          Create
        </Link>
        <span
          className="text-sm font-medium text-muted-dim"
          title="Coming soon"
        >
          Docs
        </span>
        <ConnectWalletButton />
      </div>
    </nav>
  );
}
