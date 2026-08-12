// Server-side scan of the router's `Routed` events.
//
// The Soroban RPC only pages forward, and each `getEvents` call walks a bounded
// slice of the ledger range — roughly 10k ledgers — before handing back a
// cursor. Walking the full ~7-day retention window one cursor at a time takes
// several seconds, which is far too slow to sit in front of a page load.
//
// So the window is cut into fixed-size chunks that are scanned in parallel and
// then deduplicated. Doing this on the server means the work happens once per
// cache period for all visitors, rather than once per visitor.

import { config } from "./config";
import { parseRoutedEvent, type RawEvent, type RoutedEvent } from "./routed-events";

/** Ledgers per chunk. Kept under the RPC's per-call scan budget so no chunk is truncated. */
const CHUNK_LEDGERS = 8_000;
const PAGE_LIMIT = 200;
/** Guard against an unbounded fan-out if the retention window ever grows. */
const MAX_CHUNKS = 24;
/** Cursor follow-ups within one chunk, for the case where a chunk is event-dense. */
const MAX_PAGES_PER_CHUNK = 5;

export type ScanResult = {
  events: RoutedEvent[];
  oldestLedger: number;
  latestLedger: number;
  /** False when the window was larger than MAX_CHUNKS could cover. */
  complete: boolean;
};

type EventPage = {
  events?: RawEvent[];
  cursor?: string;
  oldestLedger?: number;
  latestLedger?: number;
};

async function rpc<T>(method: string, params?: unknown): Promise<T> {
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = (await res.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  if (body.result === undefined) throw new Error(`RPC ${method}: empty result`);
  return body.result;
}

const FILTERS = [
  { type: "contract", contractIds: [config.contracts.router] },
];

/** A cursor is a TOID string; its high 32 bits are the ledger sequence. */
function ledgerOfCursor(cursor: string): number {
  const toid = Number(cursor.split("-")[0]);
  return Math.floor(toid / 2 ** 32);
}

/**
 * The RPC rejects a `startLedger` below its retention floor, and that floor
 * slides forward as ledgers close — so a bound read a second ago can already be
 * stale. Rather than guess a safety margin, read the floor back off the error
 * and retry once.
 */
async function getEventsFrom(startLedger: number): Promise<EventPage> {
  try {
    return await rpc<EventPage>("getEvents", {
      startLedger,
      filters: FILTERS,
      pagination: { limit: PAGE_LIMIT },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const bound = /ledger range:\s*(\d+)/.exec(message)?.[1];
    if (!bound) throw err;
    return await rpc<EventPage>("getEvents", {
      startLedger: Number(bound),
      filters: FILTERS,
      pagination: { limit: PAGE_LIMIT },
    });
  }
}

/** Scan one chunk, following cursors until it reaches `end` or runs out of pages. */
async function scanChunk(start: number, end: number): Promise<RawEvent[]> {
  const collected: RawEvent[] = [];
  let page = await getEventsFrom(start);

  for (let i = 0; i < MAX_PAGES_PER_CHUNK; i++) {
    collected.push(...(page.events ?? []));
    if (!page.cursor) break;
    if (ledgerOfCursor(page.cursor) >= end) break;
    page = await rpc<EventPage>("getEvents", {
      filters: FILTERS,
      pagination: { cursor: page.cursor, limit: PAGE_LIMIT },
    });
  }

  return collected;
}

/** Every `Routed` event the RPC still retains, newest first. */
export async function scanRoutedEvents(): Promise<ScanResult> {
  // The first call doubles as a probe: any getEvents response reports the
  // retention bounds, which is the only way to learn how far back to start.
  const latest = await rpc<{ sequence: number }>("getLatestLedger");
  const probe = await getEventsFrom(Math.max(1, latest.sequence - 1));

  const oldestLedger = probe.oldestLedger ?? latest.sequence;
  const latestLedger = probe.latestLedger ?? latest.sequence;

  const starts: number[] = [];
  for (
    let ledger = oldestLedger;
    ledger <= latestLedger && starts.length < MAX_CHUNKS;
    ledger += CHUNK_LEDGERS
  ) {
    starts.push(ledger);
  }
  const complete =
    starts.length === 0 ||
    starts[starts.length - 1] + CHUNK_LEDGERS > latestLedger;

  const chunks = await Promise.all(
    starts.map((start) =>
      scanChunk(start, start + CHUNK_LEDGERS).catch(() => [] as RawEvent[]),
    ),
  );

  // Chunk boundaries overlap slightly, so the same event can arrive twice.
  const byId = new Map<string, RoutedEvent>();
  for (const raw of chunks.flat()) {
    if (raw.inSuccessfulContractCall === false) continue;
    const parsed = parseRoutedEvent(raw);
    if (!parsed) continue;
    byId.set(raw.id ?? `${parsed.txHash}:${parsed.ledger}`, parsed);
  }

  const events = [...byId.values()].sort((a, b) => b.ts - a.ts);
  return { events, oldestLedger, latestLedger, complete };
}
