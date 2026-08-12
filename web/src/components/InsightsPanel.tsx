"use client";

import { useCallback, useEffect, useState } from "react";
import { fromBaseUnits, money, timeAgo } from "@/lib/format";
import { Stat, Skeleton, SectionTitle, Empty } from "./ui";

type Insights = {
  chain: {
    available: boolean;
    remittances: number;
    totalVolume: string;
    totalSaved: string;
    uniqueSenders: number;
    uniqueRecipients: number;
    participants: number;
    daily: { date: string; volume: string; count: number }[];
    scannedAt: number | null;
  };
  vault:
    | {
        available: true;
        totalAssets: string;
        totalShares: string;
        sharePrice: number;
      }
    | { available: false };
  reports: {
    errors24h: number;
    totalErrors: number;
    feedbackCount: number;
    feedbackAvg: number;
  };
  generatedAt: number;
};

type Feedback = {
  count: number;
  avg: number;
  recent: { rating: number; message: string; role?: string; ts: number }[];
};

const REFRESH_MS = 15_000;

export function InsightsPanel() {
  const [data, setData] = useState<Insights | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const [i, f] = await Promise.allSettled([
      fetch("/api/insights").then((r) => r.json()),
      fetch("/api/feedback").then((r) => r.json()),
    ]);
    if (i.status === "fulfilled") setData(i.value);
    if (f.status === "fulfilled") setFeedback(f.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    let live = true;
    const run = () => {
      if (live) void load();
    };
    run();
    const t = setInterval(run, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [load]);

  // Keeps the "updated Ns ago" label counting between fetches.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;

  const chain = data?.chain;
  const big = (v: string | undefined) => BigInt(v ?? "0");
  const maxDaily = chain
    ? chain.daily.reduce((m, d) => (BigInt(d.volume) > m ? BigInt(d.volume) : m), 1n)
    : 1n;

  return (
    <div className="space-y-8">
      {/* Live status strip */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                chain?.available ? "animate-ping bg-emerald-400" : "bg-slate-500"
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                chain?.available ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
          </span>
          <span className="text-sm font-medium">
            {chain?.available
              ? "Reading live from Stellar testnet"
              : "Waiting for the Stellar RPC…"}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {data ? `Updated ${timeAgo(data.generatedAt)}` : "Loading…"} · refreshes
          every 15s
        </span>
      </div>

      {/* On-chain activity */}
      <section>
        <SectionTitle hint="on-chain · rolling 7-day window">
          Settled remittance activity
        </SectionTitle>
        {loading && !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Volume routed"
              value={money(big(chain?.totalVolume))}
              accent
            />
            <Stat
              label="Remittances settled"
              value={String(chain?.remittances ?? 0)}
            />
            <Stat
              label="Auto-saved"
              value={money(big(chain?.totalSaved))}
              sub={
                chain && big(chain.totalVolume) > 0n
                  ? `${(
                      (Number(big(chain.totalSaved)) /
                        Number(big(chain.totalVolume))) *
                      100
                    ).toFixed(1)}% of volume`
                  : undefined
              }
            />
            <Stat
              label="Wallets transacting"
              value={String(chain?.participants ?? 0)}
              sub={`${chain?.uniqueSenders ?? 0} sending · ${
                chain?.uniqueRecipients ?? 0
              } receiving`}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Counted from the router&apos;s own settlement events. The network
          retains roughly seven days of contract events, so this is a rolling
          window rather than an all-time total.
        </p>
      </section>

      {/* Volume chart */}
      <section>
        <SectionTitle hint="last 7 days">Daily volume</SectionTitle>
        <div className="card p-5">
          {chain && chain.daily.some((d) => BigInt(d.volume) > 0n) ? (
            <div className="flex h-40 items-end gap-2">
              {chain.daily.map((d) => {
                const volume = BigInt(d.volume);
                const height =
                  volume > 0n
                    ? Math.max(6, Number((volume * 130n) / maxDaily))
                    : 2;
                return (
                  <div
                    key={d.date}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <div
                      className={`w-full rounded-t-md transition-all ${
                        volume > 0n
                          ? "bg-gradient-to-t from-brand-600 to-brand-400"
                          : "bg-white/5"
                      }`}
                      style={{ height: `${height}px` }}
                      title={`${fromBaseUnits(volume)} rUSDC · ${d.count} transfer(s)`}
                    />
                    <span className="text-[10px] text-slate-500">
                      {d.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">
              No transfers in the last 7 days — send one and it appears here
              within seconds.
            </p>
          )}
        </div>
      </section>

      {/* Vault state */}
      <section>
        <SectionTitle hint="on-chain · all-time, current">
          Savings vault
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {data?.vault.available ? (
            <>
              <Stat
                label="Held in vault"
                value={money(BigInt(data.vault.totalAssets))}
                accent
              />
              <Stat
                label="Shares issued"
                value={fromBaseUnits(BigInt(data.vault.totalShares))}
              />
              <Stat
                label="Share price"
                value={data.vault.sharePrice.toFixed(4)}
                sub={
                  data.vault.sharePrice > 1
                    ? `+${((data.vault.sharePrice - 1) * 100).toFixed(2)}% since launch`
                    : "1.0000 until yield accrues"
                }
              />
            </>
          ) : (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Read directly from the SavingsVault contract, so these figures are
          all-time and current as of this page load.
        </p>
      </section>

      {/* Monitoring */}
      <section>
        <SectionTitle hint="first-party error tracking">Monitoring</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <span
              className={`h-3 w-3 rounded-full ${
                (data?.reports.errors24h ?? 0) === 0
                  ? "bg-emerald-400"
                  : "bg-amber-400"
              }`}
            />
            <div>
              <div className="text-sm font-semibold">
                {(data?.reports.errors24h ?? 0) === 0
                  ? "All systems normal"
                  : "Errors detected"}
              </div>
              <div className="text-xs text-slate-400">
                {data?.reports.errors24h ?? 0} error(s) in last 24h
              </div>
            </div>
          </div>
          <Stat label="Errors (24h)" value={String(data?.reports.errors24h ?? 0)} />
          <Stat
            label="Errors (all-time)"
            value={String(data?.reports.totalErrors ?? 0)}
          />
        </div>
      </section>

      {/* Feedback */}
      <section>
        <SectionTitle hint={`${feedback?.count ?? 0} submissions`}>
          In-app feedback
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Avg rating"
            value={
              feedback && feedback.count ? `${feedback.avg.toFixed(1)} ★` : "—"
            }
            accent
          />
          <Stat label="Responses" value={String(feedback?.count ?? 0)} />
          <div className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Satisfaction
            </div>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={
                    feedback && n <= Math.round(feedback.avg)
                      ? "text-amber-400"
                      : "text-slate-600"
                  }
                >
                  ★
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {feedback && feedback.recent.length > 0 ? (
            feedback.recent.map((f, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400">
                    {"★".repeat(f.rating)}
                    <span className="text-slate-600">
                      {"★".repeat(5 - f.rating)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {f.role ? `${f.role} · ` : ""}
                    {timeAgo(f.ts)}
                  </span>
                </div>
                {f.message && (
                  <p className="mt-1.5 text-sm text-slate-300">{f.message}</p>
                )}
              </div>
            ))
          ) : (
            <Empty>
              No in-app feedback yet. Use the button in the corner to leave some.
            </Empty>
          )}
        </div>
      </section>

      <p className="text-center text-xs text-slate-600">
        Money figures are read from the Stellar ledger. Error reports and in-app
        ratings are first-party and reset when the app is redeployed.
      </p>
    </div>
  );
}
