// Server-side cache in front of the router event scan.
//
// The scan fans out a dozen-odd RPC calls, so running it per request would be
// both slow and rude to the public RPC. A result is held briefly in memory and
// re-served to everyone who asks during that period; concurrent callers share
// one in-flight refresh rather than each starting their own.
//
// Lives in lib/ rather than the route file because Next.js route modules may
// only export handlers and route config — /api/routed and /api/insights both
// read through this.

import { scanRoutedEvents } from "./chain-scan";
import { toWire, type RoutedEventWire } from "./routed-events";

const TTL_MS = 30_000;

export type RoutedPayload = {
  events: RoutedEventWire[];
  oldestLedger: number;
  latestLedger: number;
  complete: boolean;
  generatedAt: number;
};

let cached: RoutedPayload | null = null;
let inFlight: Promise<RoutedPayload> | null = null;

async function load(): Promise<RoutedPayload> {
  const scan = await scanRoutedEvents();
  return {
    events: scan.events.map(toWire),
    oldestLedger: scan.oldestLedger,
    latestLedger: scan.latestLedger,
    complete: scan.complete,
    generatedAt: Date.now(),
  };
}

export async function getRoutedEvents(): Promise<RoutedPayload> {
  if (cached && Date.now() - cached.generatedAt < TTL_MS) return cached;

  if (!inFlight) {
    inFlight = load()
      .then((fresh) => {
        cached = fresh;
        return fresh;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  try {
    return await inFlight;
  } catch (err) {
    // A stale answer beats no answer when the RPC is briefly unreachable.
    if (cached) return cached;
    throw err;
  }
}
