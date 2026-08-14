"use client";

import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/format";
import { useToast } from "./Toast";

/**
 * Header wallet control.
 *
 * Connected, it shows the account and a way to disconnect. Disconnected it
 * renders nothing by default: every view that needs a wallet already puts a
 * connect button in its own content, so a second one in the header was the
 * same call to action twice on one screen.
 *
 * `showConnect` opts a surface back in. The mobile menu uses it, because there
 * the header and the page's own button are never on screen together.
 */
export function WalletButton({ showConnect = false }: { showConnect?: boolean }) {
  const { address, connecting, connect, disconnect } = useWallet();
  const toast = useToast();

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(address);
            toast.success("Address copied");
          }}
          className="pill hover:bg-white/10"
          title={address}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {shortAddress(address)}
        </button>
        <button
          onClick={() => disconnect()}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (!showConnect) return null;

  return (
    <button
      onClick={() => connect()}
      disabled={connecting}
      className="btn-primary w-full px-4 py-2 text-sm"
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
