import { NextResponse } from "next/server";
import { append } from "@/lib/store";

export const runtime = "nodejs";

// Records a first-party analytics event. Called fire-and-forget from the client.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name || typeof body.name !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await append("events", {
      name: body.name,
      props: body.props ?? {},
      session: body.session ?? "unknown",
      ts: body.ts ?? Date.now(),
      ua: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
