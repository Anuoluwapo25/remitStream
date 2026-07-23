import { NextResponse } from "next/server";
import { append, readAll } from "@/lib/store";

export const runtime = "nodejs";

type FeedbackRecord = {
  rating: number;
  message: string;
  role?: string;
  address?: string;
  ts: number;
};

// Store a piece of user feedback.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rating = Number(body?.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "rating must be 1-5" },
        { status: 400 },
      );
    }
    await append("feedback", {
      rating,
      message: String(body?.message ?? "").slice(0, 2000),
      role: body?.role ? String(body.role).slice(0, 40) : undefined,
      address: body?.address ? String(body.address).slice(0, 64) : undefined,
      ts: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Public summary used by the Insights panel.
export async function GET() {
  const all = await readAll<FeedbackRecord>("feedback");
  const count = all.length;
  const avg = count
    ? all.reduce((s, f) => s + (f.rating || 0), 0) / count
    : 0;
  const recent = all
    .slice(-10)
    .reverse()
    .map((f) => ({
      rating: f.rating,
      message: f.message,
      role: f.role,
      ts: f.ts,
    }));
  return NextResponse.json({ count, avg, recent });
}
