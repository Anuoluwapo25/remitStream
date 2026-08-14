"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { useAccountData } from "@/lib/hooks";
import { quoteSplit, type Split } from "@/lib/reads";
import { sendRemittance } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { fromBaseUnits, toBaseUnits, money, shortAddress } from "@/lib/format";
import { track } from "@/lib/analytics";
import { config } from "@/lib/config";
import { useToast } from "./Toast";
import { FaucetButton } from "./FaucetButton";
import { GettingStarted } from "./Onboarding";
import { Skeleton, TxLink } from "./ui";

const G_ADDR = /^G[A-Z2-7]{55}$/;

export function SendPanel() {
  const { address, signer } = useWallet();
  const { data, loading, refresh } = useAccountData(address);
  const toast = useToast();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Split | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    split: Split;
    recipient: string;
    amount: bigint;
    txHash: string | null;
  } | null>(null);
  const quoteReq = useRef(0);

  const recipientValid = G_ADDR.test(recipient.trim());
  const amountUnits = useMemo(() => toBaseUnits(amount), [amount]);
  const amountValid = amountUnits > 0n;
  const sendingToSelf =
    recipientValid && address != null && recipient.trim() === address;
  const overBalance = data != null && amountUnits > data.walletBalance;

  // Live split preview, debounced.
  useEffect(() => {
    if (!recipientValid || !amountValid) {
      setQuote(null);
      return;
    }
    const id = ++quoteReq.current;
    setQuoting(true);
    const t = setTimeout(() => {
      quoteSplit(recipient.trim(), amountUnits)
        .then((q) => {
          if (id === quoteReq.current) setQuote(q);
        })
        .catch(() => {
          if (id === quoteReq.current) setQuote(null);
        })
        .finally(() => {
          if (id === quoteReq.current) setQuoting(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [recipient, recipientValid, amountUnits, amountValid]);

  const canSend =
    !!signer &&
    recipientValid &&
    amountValid &&
    !sendingToSelf &&
    !overBalance &&
    !sending;

  async function send() {
    if (!signer || !canSend) return;
    setSending(true);
    setLastResult(null);
    try {
      const { result: split, txHash } = await sendRemittance(
        signer,
        recipient.trim(),
        amountUnits,
      );
      track("remittance_sent", {
        sender: address,
        recipient: recipient.trim(),
        amount: Number(amountUnits),
        saved: Number(split.saved),
        payout: Number(split.payout),
        txHash,
      });
      setLastResult({
        split,
        recipient: recipient.trim(),
        amount: amountUnits,
        txHash,
      });
      toast.success(`Sent ${money(amountUnits)}`, txHash);
      setAmount("");
      setQuote(null);
      refresh();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSending(false);
    }
  }

  // Disconnected, this column is just the checklist. The connect action lives
  // in the hero and the header, so repeating it here made three identical
  // buttons compete on one screen.
  if (!address) return <GettingStarted data={null} />;

  return (
    <div className="space-y-4">
      <GettingStarted data={data} />

      {/* Balance strip */}
      <div className="card flex items-center justify-between p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Your balance
          </div>
          {loading && !data ? (
            <Skeleton className="mt-1 h-7 w-32" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">
              {money(data?.walletBalance ?? 0n)}
            </div>
          )}
        </div>
        <FaucetButton onDone={refresh} />
      </div>

      {/* Send form */}
      <div className="card p-5">
        <label className="label" htmlFor="recipient">
          Recipient address
        </label>
        <input
          id="recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="G…"
          spellCheck={false}
          className="input font-mono text-sm"
        />
        {recipient && !recipientValid && (
          <p className="mt-1.5 text-xs text-rose-300">
            That doesn't look like a Stellar address.
          </p>
        )}
        {sendingToSelf && (
          <p className="mt-1.5 text-xs text-rose-300">
            You can't send to your own address.
          </p>
        )}

        <label className="label mt-4" htmlFor="amount">
          Amount ({config.assetCode})
        </label>
        <div className="relative">
          <input
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            className="input pr-16 text-lg"
          />
          <button
            type="button"
            onClick={() =>
              data && setAmount(fromBaseUnits(data.walletBalance, { grouped: false }))
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium hover:bg-white/20"
          >
            Max
          </button>
        </div>
        {overBalance && (
          <p className="mt-1.5 text-xs text-rose-300">
            Amount exceeds your balance.
          </p>
        )}

        {/* Split preview */}
        <SplitPreview
          quote={quote}
          quoting={quoting}
          amountUnits={amountUnits}
          show={recipientValid && amountValid}
        />

        <button onClick={send} disabled={!canSend} className="btn-primary mt-5 w-full py-3">
          {sending ? "Sending…" : "Send remittance"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          Settles in ~5 seconds on Stellar · fee ≈ $0.00001
        </p>
      </div>

      {/* Receipt */}
      {lastResult && (
        <div className="card animate-fade-in border-emerald-400/20 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-sm">
              ✓
            </span>
            <span className="font-semibold">
              {money(lastResult.amount)} delivered
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-slate-400">Cashed out to recipient</div>
              <div className="text-lg font-bold">{money(lastResult.split.payout)}</div>
            </div>
            <div>
              <div className="text-slate-400">Auto-saved to vault</div>
              <div className="text-lg font-bold text-brand-300">
                {money(lastResult.split.saved)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            To {shortAddress(lastResult.recipient)}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3">
            <TxLink
              hash={lastResult.txHash}
              label="View this transaction on Stellar"
            />
            <Link
              href="/history"
              className="text-xs font-medium text-slate-400 hover:text-white"
            >
              All transactions →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SplitPreview({
  quote,
  quoting,
  amountUnits,
  show,
}: {
  quote: Split | null;
  quoting: boolean;
  amountUnits: bigint;
  show: boolean;
}) {
  if (!show) return null;

  const total = amountUnits > 0n ? amountUnits : 1n;
  const savedPct = quote ? Number((quote.saved * 100n) / total) : 0;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/50 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>How this splits for the recipient</span>
        {quoting && <span className="text-slate-500">updating…</span>}
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="bg-emerald-400/80 transition-all"
          style={{ width: `${100 - savedPct}%` }}
        />
        <div
          className="bg-brand-500 transition-all"
          style={{ width: `${savedPct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="text-slate-400">Cash out</span>
          <span className="ml-auto font-semibold tabular-nums">
            {quote ? money(quote.payout) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
          <span className="text-slate-400">Saved</span>
          <span className="ml-auto font-semibold tabular-nums text-brand-300">
            {quote ? money(quote.saved) : "—"}
          </span>
        </div>
      </div>
      {quote && quote.saved === 0n && (
        <p className="mt-2 text-xs text-slate-500">
          This recipient hasn't set a savings rule, so the full amount is cashed out.
        </p>
      )}
    </div>
  );
}
