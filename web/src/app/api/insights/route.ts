import { NextResponse } from "next/server";
import { readAll } from "@/lib/store";
import { getRoutedEvents } from "@/lib/routed-cache";
import { getVaultTotals } from "@/lib/reads";
import { fromWire } from "@/lib/routed-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aggregates the numbers behind the Insights page.
//
// A pilot user reported that "the Insights page should display real-time data,
// as the current data appears to be hardcoded", and they were reading a real
// problem. Every headline figure used to come from an append-only file under
// .data/, which on a serverless host is a per-instance ephemeral filesystem:
// events written by one request are invisible to the next, so the totals never
// accumulated and looked frozen.
//
// Money figures are now derived from chain state, which is the only source
// that is both authoritative and shared across instances:
//
//   activity — the router's `Routed` events, re-scanned on a 30s cycle. Bounded
//              by the RPC's ~7-day retention window, so it is reported as a
//              rolling window rather than an all-time total.
//   vault    — read straight from the SavingsVault contract, so it is genuinely
//              all-time and current as of this request.
//
// Feedback and client error reports have no on-chain equivalent and still come
// from the first-party store; the response marks their source so the UI can be
// honest about which numbers survive a redeploy.

type ErrorRecord = { ts?: number };
type FeedbackRecord = { rating?: number; ts?: number };

const DAY_MS = 86_400_000;

export async function GET() {
  const [routed, vault, errors, feedback] = await Promise.all([
    getRoutedEvents().catch(() => null),
    getVaultTotals().catch(() => null),
    readAll<ErrorRecord>("errors").catch(() => []),
    readAll<FeedbackRecord>("feedback").catch(() => []),
  ]);

  const events = (routed?.events ?? []).map(fromWire);

  let totalVolume = 0n;
  let totalSaved = 0n;
  const senders = new Set<string>();
  const recipients = new Set<string>();
  for (const ev of events) {
    totalVolume += ev.amount;
    totalSaved += ev.saved;
    senders.add(ev.sender);
    recipients.add(ev.recipient);
  }

  const participants = new Set([...senders, ...recipients]);

  // Daily volume for the last 7 days, which is also the event window.
  //
  // Bucketed and labelled in UTC. Cutting days at local midnight while labelling
  // them with an ISO date puts a transaction in the wrong bar for any host that
  // is not on UTC, and shifts the whole chart when the deployment region moves.
  const now = Date.now();
  const todayUtc = Math.floor(now / DAY_MS) * DAY_MS;
  const daily: { date: string; volume: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const from = todayUtc - i * DAY_MS;
    const to = from + DAY_MS;
    const inDay = events.filter((e) => e.ts >= from && e.ts < to);
    daily.push({
      date: new Date(from).toISOString().slice(0, 10),
      volume: inDay.reduce((s, e) => s + e.amount, 0n).toString(),
      count: inDay.length,
    });
  }

  const feedbackCount = feedback.length;

  return NextResponse.json(
    {
      // On-chain, rolling window.
      chain: {
        available: routed != null,
        remittances: events.length,
        totalVolume: totalVolume.toString(),
        totalSaved: totalSaved.toString(),
        uniqueSenders: senders.size,
        uniqueRecipients: recipients.size,
        participants: participants.size,
        daily,
        windowFromLedger: routed?.oldestLedger ?? null,
        windowToLedger: routed?.latestLedger ?? null,
        scannedAt: routed?.generatedAt ?? null,
      },
      // On-chain, current and all-time.
      vault: vault
        ? {
            available: true,
            totalAssets: vault.totalAssets.toString(),
            totalShares: vault.totalShares.toString(),
            sharePrice:
              vault.totalShares > 0n
                ? Number(vault.totalAssets) / Number(vault.totalShares)
                : 1,
          }
        : { available: false },
      // First-party, resets with the deployment's ephemeral store.
      reports: {
        errors24h: errors.filter((e) => (e.ts ?? 0) > now - DAY_MS).length,
        totalErrors: errors.length,
        feedbackCount,
        feedbackAvg: feedbackCount
          ? feedback.reduce((s, f) => s + (f.rating ?? 0), 0) / feedbackCount
          : 0,
      },
      generatedAt: now,
    },
    { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } },
  );
}
