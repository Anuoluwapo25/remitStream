"use client";

// Send money to someone who doesn't have a Stellar wallet yet — no address
// needed up front. The amount is locked in the claim-link contract behind a
// secret generated on this device; only its hash ever reaches the chain. The
// secret travels however you already reach the recipient — text, WhatsApp,
// email — inside a link they open once they have (or create) a wallet.
//
// See contracts/claim-link for the contract this talks to, and
// lib/claimLinks.ts for how the secret is generated and encoded.

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { createClaimLink } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { config } from "@/lib/config";
import { toBaseUnits, money } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useToast } from "./Toast";
import { TxLink } from "./ui";

const EXPIRY_OPTIONS = [
  { label: "Never expires", seconds: 0 },
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

type Created = { url: string; txHash: string | null; amount: bigint };

export function ClaimLinkPanel() {
  const { address, signer, connect } = useWallet();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [expirySeconds, setExpirySeconds] = useState(EXPIRY_OPTIONS[2].seconds);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const amountUnits = toBaseUnits(amount);
  const canSend = !!signer && amountUnits > 0n && !sending;

  async function create() {
    if (!signer) return;
    setSending(true);
    setCopied(false);
    try {
      const expiresAt =
        expirySeconds > 0 ? Math.floor(Date.now() / 1000) + expirySeconds : 0;
      const { result, txHash } = await createClaimLink(signer, {
        amount: amountUnits,
        note: note.trim(),
        expiresAt,
      });
      track("claim_link_created", {
        claim_id: result.claimId.toString(),
        amount: Number(amountUnits),
        expirySeconds,
        txHash,
      });
      setCreated({ url: result.url, txHash, amount: amountUnits });
      setAmount("");
      setNote("");
    } catch (e) {
      toast.error(humanizeError(e, "claims"));
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      track("claim_link_copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.");
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold">
          Send without their wallet
        </h2>
        <span className="pill">no address needed</span>
      </div>
      <p className="mb-4 text-sm text-stone-400">
        Lock the money behind a link instead of an address. Whoever opens it
        can claim it into a wallet of their own — new or existing. Nobody
        needs to sign anything to receive it; opening the right link is
        enough.
      </p>

      {!address ? (
        <button className="btn-primary w-full" onClick={() => connect()}>
          Connect wallet to send a claim link
        </button>
      ) : (
        <>
          <label className="label">Amount ({config.assetCode})</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            className="input text-lg"
            disabled={sending}
          />

          <label className="label mt-3">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 140))}
            placeholder="For your birthday!"
            className="input text-sm"
            disabled={sending}
          />

          <label className="label mt-3">Expires</label>
          <div className="flex flex-wrap gap-2">
            {EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setExpirySeconds(opt.seconds)}
                disabled={sending}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  expirySeconds === opt.seconds
                    ? "border-brand-400/60 bg-brand-500/15 text-brand-100"
                    : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {expirySeconds === 0 && (
            <p className="mt-1.5 text-xs text-stone-500">
              A link that never expires can never be taken back either — it
              waits for the secret forever.
            </p>
          )}

          <button
            onClick={create}
            disabled={!canSend}
            className="btn-primary mt-4 w-full py-3"
          >
            {sending ? "Locking funds…" : "Create claim link"}
          </button>
        </>
      )}

      {created && (
        <div className="mt-5 animate-fade-in rounded-xl border border-brand-400/30 bg-brand-500/5 p-4">
          <div className="flex items-center gap-2 text-brand-200">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/20 text-sm">
              🔗
            </span>
            <span className="font-semibold">
              {money(created.amount)} locked — share this link
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-ink-900/60 p-2.5">
            <code className="min-w-0 flex-1 truncate text-xs text-stone-300">
              {created.url}
            </code>
            <button
              onClick={copyLink}
              className="btn-ghost flex-none px-3 py-1.5 text-xs"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Anyone who opens this link can claim it — send it only to the
            person you mean to pay, the same as you would a gift card code.
          </p>
          <div className="mt-3 border-t border-white/10 pt-2">
            <TxLink hash={created.txHash} label="View this transaction on Stellar" />
          </div>
        </div>
      )}
    </div>
  );
}
