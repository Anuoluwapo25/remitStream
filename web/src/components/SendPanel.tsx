"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { useAccountData } from "@/lib/hooks";
import { quoteSplit, quotePlan, type Split, type GoalFill } from "@/lib/reads";
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
  const [plan, setPlan] = useState<GoalFill[]>([]);
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
      setPlan([]);
      return;
    }
    const id = ++quoteReq.current;
    setQuoting(true);
    const t = setTimeout(() => {
      Promise.all([
        quoteSplit(recipient.trim(), amountUnits),
        quotePlan(recipient.trim(), amountUnits).catch(() => [] as GoalFill[]),
      ])
        .then(([q, p]) => {
          if (id === quoteReq.current) {
            setQuote(q);
            setPlan(p);
          }
        })
        .catch(() => {
          if (id === quoteReq.current) {
            setQuote(null);
            setPlan([]);
          }
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
      setPlan([]);
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
          <div className="text-xs uppercase tracking-wide text-stone-400">
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
          <p className="mt-1.5 text-xs text-flag-300">
            That doesn't look like a Stellar address.
          </p>
        )}
        {sendingToSelf && (
          <p className="mt-1.5 text-xs text-flag-300">
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
          <p className="mt-1.5 text-xs text-flag-300">
            Amount exceeds your balance.
          </p>
        )}

        {/* Split preview */}
        <SplitPreview
          quote={quote}
          plan={plan}
          quoting={quoting}
          amountUnits={amountUnits}
          show={recipientValid && amountValid}
        />

        <button onClick={send} disabled={!canSend} className="btn-primary mt-5 w-full py-3">
          {sending ? "Sending…" : "Send remittance"}
        </button>
        <p className="mt-2 text-center text-xs text-stone-500">
          Settles in ~5 seconds on Stellar · fee ≈ $0.00001
        </p>
      </div>

      {/* Receipt */}
      {lastResult && (
        <div className="card animate-fade-in border-accent-400/20 bg-accent-500/5 p-5">
          <div className="flex items-center gap-2 text-accent-300">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-500/20 text-sm">
              ✓
            </span>
            <span className="font-semibold">
              {money(lastResult.amount)} delivered
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-stone-400">Cashed out to recipient</div>
              <div className="text-lg font-bold">{money(lastResult.split.payout)}</div>
            </div>
            <div>
              <div className="text-stone-400">Auto-saved to vault</div>
              <div className="text-lg font-bold text-brand-300">
                {money(lastResult.split.saved)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-stone-400">
            To {shortAddress(lastResult.recipient)}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3">
            <TxLink
              hash={lastResult.txHash}
              label="View this transaction on Stellar"
            />
            <Link
              href="/history"
              className="text-xs font-medium text-stone-400 hover:text-white"
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
  plan,
  quoting,
  amountUnits,
  show,
}: {
  quote: Split | null;
  plan: GoalFill[];
  quoting: boolean;
  amountUnits: bigint;
  show: boolean;
}) {
  if (!show) return null;

  const total = amountUnits > 0n ? amountUnits : 1n;
  const savedPct = quote ? Number((quote.saved * 100n) / total) : 0;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/50 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-stone-400">
        <span>What the person receiving gets</span>
        {quoting && <span className="text-stone-500">updating…</span>}
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="bg-accent-400/80 transition-all"
          style={{ width: `${100 - savedPct}%` }}
        />
        <div
          className="bg-brand-400 transition-all"
          style={{ width: `${savedPct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-400/80" />
          <span className="text-stone-400">Cash out</span>
          <span className="ml-auto font-semibold tabular-nums">
            {quote ? money(quote.payout) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
          <span className="text-stone-400">Saved</span>
          <span className="ml-auto font-semibold tabular-nums text-brand-300">
            {quote ? money(quote.saved) : "—"}
          </span>
        </div>
      </div>

      {plan.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
          <div className="text-xs text-stone-400">Goes toward</div>
          {plan.map((fill) => (
            <div
              key={fill.goalId}
              className="flex items-center gap-2 text-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              <span className="truncate text-stone-300">{fill.name}</span>
              {fill.reachesTarget && (
                <span className="rounded-full bg-accent-500/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-300">
                  fills it
                </span>
              )}
              <span className="ml-auto font-semibold tabular-nums text-brand-200">
                {money(fill.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {quote && quote.saved === 0n && (
        <div
          role="status"
          className="mt-3 flex gap-3 rounded-lg border-2 border-brand-400/50 bg-brand-500/10 p-3.5"
        >
          <span
            aria-hidden
            className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-300 text-sm font-bold text-ink-900"
          >
            i
          </span>
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-brand-200">
              The full amount lands in their wallet — nothing is missing.
            </p>
            <p className="mt-1 text-stone-200">
              Auto-save is set by whoever <strong>receives</strong> the money,
              on their own dashboard. You can&apos;t set it from here.
            </p>
            <p className="mt-1.5 text-stone-200">
              Saving from money sent to <strong>you</strong>?{" "}
              <Link
                href="/dashboard"
                className="font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200"
              >
                Set up a goal on your dashboard →
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
