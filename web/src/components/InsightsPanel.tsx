"use client";

import { useEffect, useState } from "react";
import { config, explorerContract } from "@/lib/config";
import { fromBaseUnits, shortAddress, timeAgo } from "@/lib/format";
import { Stat, Skeleton, SectionTitle, Empty } from "./ui";

type Insights = {
  remittances: number;
  totalVolume: number;
  totalSaved: number;
  uniqueSenders: number;
  uniqueRecipients: number;
  walletsConnected: number;
  errors24h: number;
  totalErrors: number;
  feedbackCount: number;
  feedbackAvg: number;
  daily: { date: string; volume: number; count: number }[];
};

type Feedback = {
  count: number;
  avg: number;
  recent: { rating: number; message: string; role?: string; ts: number }[];
};

export function InsightsPanel() {
  const [data, setData] = useState<Insights | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const [i, f] = await Promise.all([
          fetch("/api/insights").then((r) => r.json()),
          fetch("/api/feedback").then((r) => r.json()),
        ]);
        if (live) {
          setData(i);
          setFeedback(f);
        }
      } finally {
        if (live) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const distinctParticipants = data
    ? data.uniqueSenders + data.uniqueRecipients
    : 0;

  const maxDaily = data
    ? Math.max(1, ...data.daily.map((d) => d.volume))
    : 1;

  return (
    <div className="space-y-8">
      {/* Product analytics */}
      <section>
        <SectionTitle hint="auto-refreshes every 15s">
          Product analytics
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
              label="Total volume"
              value={`${fromBaseUnits(BigInt(data?.totalVolume ?? 0))} rUSDC`}
              accent
            />
            <Stat label="Remittances sent" value={String(data?.remittances ?? 0)} />
            <Stat
              label="Auto-saved"
              value={`${fromBaseUnits(BigInt(data?.totalSaved ?? 0))} rUSDC`}
              sub={
                data && data.totalVolume > 0
                  ? `${((data.totalSaved / data.totalVolume) * 100).toFixed(1)}% of volume`
                  : undefined
              }
            />
            <Stat
              label="Wallets connected"
              value={String(data?.walletsConnected ?? 0)}
              sub={`${distinctParticipants} on-chain participants`}
            />
          </div>
        )}
      </section>

      {/* Volume chart */}
      <section>
        <SectionTitle hint="last 7 days">Daily volume</SectionTitle>
        <div className="card p-5">
          {data && data.daily.some((d) => d.volume > 0) ? (
            <div className="flex h-40 items-end gap-2">
              {data.daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 transition-all"
                    style={{
                      height: `${Math.max(4, (d.volume / maxDaily) * 130)}px`,
                    }}
                    title={`${fromBaseUnits(BigInt(d.volume))} rUSDC · ${d.count} transfer(s)`}
                  />
                  <span className="text-[10px] text-slate-500">
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">
              No transfers yet — send one to see it appear here.
            </p>
          )}
        </div>
      </section>

      {/* Monitoring */}
      <section>
        <SectionTitle hint="error tracking">Monitoring</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <span
              className={`h-3 w-3 rounded-full ${
                (data?.errors24h ?? 0) === 0 ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <div>
              <div className="text-sm font-semibold">
                {(data?.errors24h ?? 0) === 0 ? "All systems normal" : "Errors detected"}
              </div>
              <div className="text-xs text-slate-400">
                {data?.errors24h ?? 0} error(s) in last 24h
              </div>
            </div>
          </div>
          <Stat label="Errors (24h)" value={String(data?.errors24h ?? 0)} />
          <Stat label="Errors (all-time)" value={String(data?.totalErrors ?? 0)} />
        </div>
      </section>

      {/* Feedback */}
      <section>
        <SectionTitle hint={`${feedback?.count ?? 0} submissions`}>
          User feedback
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Avg rating"
            value={
              feedback && feedback.count
                ? `${feedback.avg.toFixed(1)} ★`
                : "—"
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
            <Empty>No feedback yet. Use the button in the corner to leave some.</Empty>
          )}
        </div>
      </section>

      {/* Deployment / system status */}
      <section>
        <SectionTitle hint={config.network}>Deployment</SectionTitle>
        <div className="card divide-y divide-white/5">
          {(
            [
              ["rUSDC token", config.contracts.token],
              ["SavingsVault", config.contracts.vault],
              ["AutoSplitRouter", config.contracts.router],
            ] as const
          ).map(([name, id]) => (
            <div
              key={id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <span className="text-sm font-medium">{name}</span>
              <a
                href={explorerContract(id)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-brand-300 hover:underline"
              >
                {shortAddress(id, 6, 6)} ↗
              </a>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-slate-600">
        Pageview & web-vitals monitoring via Vercel Analytics · product events &
        error tracking are first-party.
      </p>
    </div>
  );
}
