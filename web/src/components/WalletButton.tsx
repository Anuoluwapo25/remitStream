"use client";

import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/format";
import { useToast } from "./Toast";

export function WalletButton() {
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

  return (
    <button
      onClick={() => connect()}
      disabled={connecting}
      className="btn-primary px-4 py-2 text-sm"
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
