import { NextResponse } from "next/server";
import { getRoutedEvents } from "@/lib/routed-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every remittance the router has settled inside the RPC's retention window,
// read live from the ledger. This is the source of truth for incoming
// transfers on the history page and for the volume figures on Insights —
// nothing here is stored or seeded, it is re-derived from chain state on a
// short cache cycle.
export async function GET() {
  try {
    const payload = await getRoutedEvents();
    return NextResponse.json(payload, {
      headers: {
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the Stellar RPC." },
      { status: 502 },
    );
  }
}
