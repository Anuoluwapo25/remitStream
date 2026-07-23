import { NextResponse } from "next/server";
import { readAll } from "@/lib/store";

export const runtime = "nodejs";

type Event = {
  name: string;
  props?: Record<string, unknown>;
  session?: string;
  ts?: number;
};
type ErrorRecord = { ts?: number };
type FeedbackRecord = { rating?: number; ts?: number };

// Aggregates first-party analytics into the numbers shown on the Insights panel.
// Every `remittance_sent` event is logged only after a confirmed on-chain route,
// so these volume figures reflect real settled transactions.
export async function GET() {
  const [events, errors, feedback] = await Promise.all([
    readAll<Event>("events"),
    readAll<ErrorRecord>("errors"),
    readAll<FeedbackRecord>("feedback"),
  ]);

  const sends = events.filter((e) => e.name === "remittance_sent");
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

  const totalVolume = sends.reduce((s, e) => s + num(e.props?.amount), 0);
  const totalSaved = sends.reduce((s, e) => s + num(e.props?.saved), 0);

  const senders = new Set(
    sends.map((e) => String(e.props?.sender ?? "")).filter(Boolean),
  );
  const recipients = new Set(
    sends.map((e) => String(e.props?.recipient ?? "")).filter(Boolean),
  );
  const wallets = new Set(
    events
      .filter((e) => e.name === "wallet_connected")
      .map((e) => e.session ?? "")
      .filter(Boolean),
  );

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const recentErrors = errors.filter((e) => (e.ts ?? 0) > dayAgo).length;

  const feedbackCount = feedback.length;
  const feedbackAvg = feedbackCount
    ? feedback.reduce((s, f) => s + (f.rating ?? 0), 0) / feedbackCount
    : 0;

  // Daily volume series for the last 7 days.
  const days: { date: string; volume: number; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now - i * 86_400_000);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 86_400_000;
    const inDay = sends.filter(
      (e) => (e.ts ?? 0) >= start.getTime() && (e.ts ?? 0) < end,
    );
    days.push({
      date: start.toISOString().slice(0, 10),
      volume: inDay.reduce((s, e) => s + num(e.props?.amount), 0),
      count: inDay.length,
    });
  }

  return NextResponse.json({
    remittances: sends.length,
    totalVolume,
    totalSaved,
    uniqueSenders: senders.size,
    uniqueRecipients: recipients.size,
    walletsConnected: wallets.size,
    errors24h: recentErrors,
    totalErrors: errors.length,
    feedbackCount,
    feedbackAvg,
    daily: days,
    generatedAt: now,
  });
}
