import { NextResponse } from "next/server";
import { append } from "@/lib/store";

export const runtime = "nodejs";

// Receives a client-side error report for the monitoring dashboard.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await append("errors", {
      message: String(body?.message ?? "unknown").slice(0, 2000),
      stack: body?.stack ? String(body.stack).slice(0, 4000) : undefined,
      context: body?.context ?? {},
      url: body?.url,
      session: body?.session ?? "unknown",
      ts: body?.ts ?? Date.now(),
      ua: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
