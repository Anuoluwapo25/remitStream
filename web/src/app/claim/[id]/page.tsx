"use client";

// Where a claim link lands. No wallet is required to load this page or see
// what's waiting — only to actually claim it. The secret that unlocks the
// claim lives in the URL fragment (after "#"), which this page reads once,
// client-side; it is never sent to any server.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { getClaimPreview, type ClaimPreview } from "@/lib/reads";
import { redeemClaim } from "@/lib/actions";
import { secretFromLocationHash } from "@/lib/claimLinks";
import { humanizeError } from "@/lib/contracts";
import { config } from "@/lib/config";
import { money, shortAddress } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useToast } from "@/components/Toast";
import { TxLink, Skeleton } from "@/components/ui";

function parseClaimId(raw: string | string[] | undefined): bigint | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s || !/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function expiryLabel(expiresAt: number): string | null {
  if (!expiresAt) return null;
  const ms = expiresAt * 1000 - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `expires in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `expires in ${hrs}h`;
  return `expires ${new Date(expiresAt * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function ClaimPage() {
  const params = useParams<{ id: string }>();
  const claimId = parseClaimId(params?.id);
  const { address, signer, connect, connecting } = useWallet();
  const toast = useToast();

  const [secret] = useState(() => secretFromLocationHash());
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedTxHash, setClaimedTxHash] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<bigint | null>(null);

  useEffect(() => {
    if (!config.claimLinksEnabled) {
      setLoadError(
        "Claim links aren't live on this deployment yet — check back soon.",
      );
      setLoading(false);
      return;
    }
    if (claimId === null) {
      setLoadError("That doesn't look like a valid claim link.");
      setLoading(false);
      return;
    }
    let live = true;
    getClaimPreview(claimId)
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch((e) => {
        if (live) setLoadError(humanizeError(e, "claims"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [claimId]);

  async function doClaim() {
    if (!signer || claimId === null || !secret) return;
    setClaiming(true);
    try {
      const { result, txHash } = await redeemClaim(
        signer,
        claimId,
        secret,
        signer.publicKey,
      );
      track("claim_redeemed", {
        claim_id: claimId.toString(),
        amount: Number(result),
        txHash,
      });
      setClaimedAmount(result);
      setClaimedTxHash(txHash);
      setPreview((p) => (p ? { ...p, status: "Claimed" } : p));
    } catch (e) {
      toast.error(humanizeError(e, "claims"));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <div className="text-center">
        <span className="pill">claim link</span>
        <h1 className="font-display mt-3 text-2xl font-semibold">
          Someone sent you money
        </h1>
      </div>

      {loading && (
        <div className="card space-y-3 p-6">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}

      {!loading && loadError && (
        <div className="card border-flag-400/20 bg-flag-500/5 p-6 text-center text-sm text-flag-200">
          {loadError}
        </div>
      )}

      {!loading && preview && !loadError && (
        <div className="card p-6">
          {claimedTxHash ? (
            <div className="animate-fade-in text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-500/20 text-2xl">
                ✓
              </span>
              <p className="mt-3 text-lg font-semibold text-accent-200">
                {money(claimedAmount ?? preview.amount)} added to your wallet
              </p>
              <div className="mt-3">
                <TxLink hash={claimedTxHash} label="View this transaction on Stellar" />
              </div>
              <Link
                href="/dashboard"
                className="mt-4 inline-block text-sm font-medium text-brand-300 hover:underline"
              >
                Go to your dashboard →
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="text-4xl font-black tabular-nums text-brand-300">
                  {money(preview.amount)}
                </div>
                <div className="mt-1 text-xs text-stone-400">
                  from {shortAddress(preview.sender)}
                </div>
              </div>

              {preview.note && (
                <p className="mt-4 rounded-lg border border-white/10 bg-ink-900/50 p-3 text-center text-sm italic text-stone-300">
                  &ldquo;{preview.note}&rdquo;
                </p>
              )}

              {expiryLabel(preview.expiresAt) && (
                <p className="mt-3 text-center text-xs text-stone-500">
                  {expiryLabel(preview.expiresAt)}
                </p>
              )}

              {preview.status !== "Pending" ? (
                <p className="mt-4 text-center text-sm text-stone-400">
                  {preview.status === "Claimed"
                    ? "This link has already been claimed."
                    : "This link expired and was returned to the sender."}
                </p>
              ) : !secret ? (
                <p className="mt-4 text-center text-sm text-flag-300">
                  This link is missing its claim code — make sure you copied
                  the whole link, including everything after the “#”.
                </p>
              ) : !address ? (
                <button
                  onClick={() => connect()}
                  disabled={connecting}
                  className="btn-primary mt-5 w-full py-3"
                >
                  {connecting ? "Connecting…" : "Connect or create a wallet to claim"}
                </button>
              ) : (
                <button
                  onClick={doClaim}
                  disabled={claiming}
                  className="btn-primary mt-5 w-full py-3"
                >
                  {claiming ? "Claiming…" : `Claim to ${shortAddress(address)}`}
                </button>
              )}

              <p className="mt-4 text-center text-xs text-stone-500">
                No wallet yet? Connecting will offer to create one — it takes
                under a minute and this link works the moment it's ready.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
