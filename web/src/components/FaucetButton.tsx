"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { claimFaucet } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { track } from "@/lib/analytics";
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
      await claimFaucet(signer);
      track("faucet_claimed");
      toast.success("1,000 rUSDC added to your wallet");
      onDone?.();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={claim}
      disabled={loading || !signer}
      className={`btn-ghost ${className}`}
    >
      {loading ? "Claiming…" : "Get test rUSDC"}
    </button>
  );
}
