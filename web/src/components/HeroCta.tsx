"use client";

// The landing page's primary action.
//
// It used to be a link to #send, which on desktop scrolls to a panel already
// sitting beside the hero — so the page's most prominent button did nothing,
// while the action it implied lived in a second button further right. Now the
// hero owns the primary action and adapts to what is actually possible:
// connect if there is no wallet, jump to the form if there is.

import Link from "next/link";
import { useWallet } from "@/lib/wallet";

export function HeroCta() {
  const { address, connecting, connect } = useWallet();

  if (address) {
    return (
      <Link href="#send" className="btn-primary px-5 py-2.5">
        Send a transfer
      </Link>
    );
  }

  return (
    <button
      onClick={() => connect()}
      disabled={connecting}
      className="btn-primary px-5 py-2.5"
    >
      {connecting ? "Connecting…" : "Connect your wallet"}
    </button>
  );
}
