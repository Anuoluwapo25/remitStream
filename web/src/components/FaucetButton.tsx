"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { claimFaucet } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { track } from "@/lib/analytics";
import { config } from "@/lib/config";
import { useToast } from "./Toast";

export function FaucetButton({
  onDone,
  className = "",
}: {
  onDone?: () => void;
  className?: string;
}) {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function claim() {
    if (!signer) return;
    setLoading(true);
    try {
      const { txHash } = await claimFaucet(signer);
      track("faucet_claimed", { txHash });
      toast.success(`1,000 ${config.assetCode} added to your wallet`, txHash);
      onDone?.();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  // The faucet is a property of the testnet token, not of the product. A
  // deployment pointed at a real asset has nothing to hand out.
  if (!config.faucetEnabled) return null;

  return (
    <button
      onClick={claim}
      disabled={loading || !signer}
      className={`btn-ghost ${className}`}
    >
      {loading ? "Claiming…" : `Get test ${config.assetCode}`}
    </button>
  );
}
