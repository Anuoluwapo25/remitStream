"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useHistory } from "@/lib/hooks";
import type { HistoryEntry, HistoryKind } from "@/lib/history";
import { config, explorerTx, explorerAccount } from "@/lib/config";
import { bpsToPercent, money, shortAddress, timeAgo } from "@/lib/format";
import { Skeleton, Empty, Stat } from "./ui";

type Filter = "all" | "sent" | "received" | "savings";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
  { id: "savings", label: "Savings" },
];

const KIND_META: Record<
  HistoryKind,
  { label: string; icon: string; tone: string }
> = {
  sent: { label: "Sent", icon: "↗", tone: "text-stone-300 bg-ink-700/60" },
  received: {
    label: "Received",
    icon: "↙",
    tone: "text-accent-200 bg-accent-500/10",
  },
  withdraw: {
    label: "Withdrew savings",
    icon: "↓",
    tone: "text-brand-200 bg-brand-500/10",
  },
  deposit: {
    label: "Deposited to vault",
    icon: "↑",
    tone: "text-brand-200 bg-brand-500/10",
  },
  rule: {
    label: "Updated savings goals",
    icon: "⚙",
    tone: "text-stone-300 bg-ink-700/60",
  },
  faucet: {
    label: `Claimed test ${config.assetCode}`,
    icon: "🚰",
    tone: "text-stone-300 bg-white/5",
  },
  other: {
    label: "Contract call",
    icon: "·",
    tone: "text-stone-400 bg-white/5",
  },
};

function matches(entry: HistoryEntry, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "sent":
      return entry.kind === "sent";
    case "received":
      return entry.kind === "received";
    case "savings":
      return (
        entry.kind === "withdraw" ||
        entry.kind === "deposit" ||
        entry.kind === "rule"
      );
  }
}

export function HistoryPanel() {
  const { address, connect } = useWallet();
  const { history, loading, error, refresh } = useHistory(address);
  const [filter, setFilter] = useState<Filter>("all");

  const entries = history?.entries ?? [];
  const visible = useMemo(
    () => entries.filter((e) => matches(e, filter)),
    [entries, filter],
  );

  const totals = useMemo(() => {
    let sent = 0n;
    let received = 0n;
    let saved = 0n;
    for (const e of entries) {
      if (!e.success) continue;
      if (e.kind === "sent") sent += e.amount ?? 0n;
      if (e.kind === "received") {
        received += e.amount ?? 0n;
        saved += e.saved ?? 0n;
      }
    }
    return { sent, received, saved };
  }, [entries]);

  if (!address) {
    return (
      <div className="card p-6 text-center">
        <p className="mb-4 text-stone-300">
          Connect your wallet to see every transaction you&apos;ve made, with a
          link to each one on the block explorer.
        </p>
        <button className="btn-primary mx-auto" onClick={() => connect()}>
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {loading && !history ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <Stat label="Total sent" value={money(totals.sent)} />
            <Stat label="Total received" value={money(totals.received)} />
            <Stat label="Auto-saved on receipt" value={money(totals.saved)} accent />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count = entries.filter((e) => matches(e, f.id)).length;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  filter === f.id
                    ? "border-brand-400/60 bg-brand-500/15 text-brand-100"
                    : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-stone-500">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {history?.eventsPending && (
            <span className="text-xs text-stone-500">
              Loading incoming transfers…
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-flag-400/20 bg-flag-500/5 p-4 text-sm text-flag-200">
          {error}{" "}
          <button onClick={refresh} className="underline">
            Retry
          </button>
        </div>
      )}

      {loading && !history ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty>
          {entries.length === 0
            ? "No transactions yet. Send a remittance and it will show up here within seconds."
            : `No ${filter} transactions yet.`}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {visible.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      {history?.eventsCovered && (
        <p className="text-xs text-stone-500">
          Sent, withdrawn and rule transactions come from full ledger history.
          Incoming remittances are read from the network&apos;s contract-event
          feed, which retains roughly the last 7 days.
        </p>
      )}
      {history && !history.eventsCovered && !history.eventsPending && (
        <p className="text-xs text-stone-500">
          Incoming remittances are read from the network&apos;s contract-event
          feed, which is temporarily unreachable. Everything you signed yourself
          is still listed above.
        </p>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const meta = KIND_META[entry.kind];

  return (
    <li className="card p-4 transition hover:border-white/20">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl text-sm ${meta.tone}`}
          aria-hidden
        >
          {meta.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{meta.label}</span>
            {!entry.success && (
              <span className="rounded-md bg-flag-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-flag-300">
                Failed
              </span>
            )}
            <span className="text-xs text-stone-500">{timeAgo(entry.ts)}</span>
          </div>

          <div className="mt-0.5 text-sm text-stone-400">
            {entry.counterparty && (
              <>
                {entry.kind === "sent" ? "To " : "From "}
                <a
                  href={explorerAccount(entry.counterparty)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-stone-300 hover:text-brand-300 hover:underline"
                >
                  {shortAddress(entry.counterparty, 6, 6)}
                </a>
              </>
            )}
            {entry.kind === "rule" && entry.saveBps != null && (
              <>Now saving {bpsToPercent(entry.saveBps)} of every transfer</>
            )}
            {entry.kind === "faucet" && <>Test funds added to your wallet</>}
            {entry.kind === "withdraw" && entry.amount == null && (
              <>Entire vault balance returned to your wallet</>
            )}
            {entry.kind === "other" && <>Called {entry.fn}()</>}
          </div>

          {(entry.payout != null || entry.saved != null) && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
              {entry.payout != null && (
                <span>
                  Cashed out{" "}
                  <span className="font-medium text-stone-300">
                    {money(entry.payout)}
                  </span>
                </span>
              )}
              {entry.saved != null && (
                <span>
                  Auto-saved{" "}
                  <span className="font-medium text-brand-300">
                    {money(entry.saved)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-none flex-col items-end gap-1">
          {entry.amount != null && (
            <span
              className={`font-semibold tabular-nums ${
                entry.kind === "received"
                  ? "text-accent-300"
                  : entry.kind === "sent"
                    ? "text-stone-100"
                    : "text-stone-300"
              }`}
            >
              {entry.kind === "sent" ? "−" : entry.kind === "received" ? "+" : ""}
              {money(entry.amount)}
            </span>
          )}
          <a
            href={explorerTx(entry.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-brand-300 hover:underline"
            title={entry.txHash}
          >
            {shortAddress(entry.txHash, 6, 4)} ↗
          </a>
        </div>
      </div>
    </li>
  );
}
