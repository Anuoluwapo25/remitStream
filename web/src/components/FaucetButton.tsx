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
  // "creating" is the first-tap case where the wallet has no testnet account
  // yet: friendbot has to make one before the faucet call can be built, which
  // adds a few seconds the user would otherwise see as an unexplained hang.
  const [stage, setStage] = useState<"idle" | "creating-account" | "claiming">(
    "idle",
  );
  const toast = useToast();
  const loading = stage !== "idle";

  async function claim() {
    if (!signer) return;
    setStage("claiming");
    try {
      const { txHash, accountCreated } = await claimFaucet(signer, setStage);
      track("faucet_claimed", { txHash, accountCreated });
      toast.success(
        accountCreated
          ? `Testnet account created and 1,000 ${config.assetCode} added to your wallet`
          : `1,000 ${config.assetCode} added to your wallet`,
        txHash,
      );
      onDone?.();
    } catch (e) {
      toast.error(humanizeError(e, "token"));
    } finally {
      setStage("idle");
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
      {stage === "creating-account"
        ? "Creating your testnet account…"
        : stage === "claiming"
          ? "Claiming…"
          : `Get test ${config.assetCode}`}
    </button>
  );
}
