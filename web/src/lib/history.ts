// Transaction history for one wallet, sourced entirely from the chain.
//
// Two sources are merged because neither is complete on its own:
//
//   Horizon  — every operation the wallet *signed*, with full retention. This
//              covers sends, withdrawals, rule changes and faucet claims, but
//              it can never show an incoming remittance: token balances live in
//              contract storage, so the recipient's account does not appear in
//              the transaction that pays them.
//
//   Routed   — the router's `Routed` events, which name both parties. This is
//   events     how incoming remittances are found, and it also supplies the
//              payout/saved split that Horizon's operation parameters omit.
//              Served by /api/routed, which scans and caches the RPC's rolling
//              retention window (~7 days on testnet) server-side.
//
// Rows are keyed by transaction hash so the two sources reconcile into one row
// per transaction.

import { config } from "./config";
import { fromWire, type RoutedEvent, type RoutedEventWire } from "./routed-events";

export type HistoryKind =
  | "sent"
  | "received"
  | "withdraw"
  | "deposit"
  | "rule"
  | "faucet"
  | "other";

export type HistoryEntry = {
  /** Stable key: one transaction can produce both a sent row and a received row. */
  id: string;
  txHash: string;
  ts: number;
  kind: HistoryKind;
  success: boolean;
  ledger?: number;
  /** Total moved, in base units. Absent for `withdraw_all`, which takes no amount. */
  amount?: bigint;
  /** Split detail — only known when the event window still covers this transaction. */
  payout?: bigint;
  saved?: bigint;
  counterparty?: string;
  saveBps?: number;
  /** Raw contract function, used by the "other" fallback row. */
  fn: string;
};

export type History = {
  entries: HistoryEntry[];
  /** True once the event feed has been merged in, so incoming transfers are covered. */
  eventsCovered: boolean;
  /** True while the event feed is still loading behind an already-rendered list. */
  eventsPending: boolean;
};

const HORIZON_LIMIT = 200;

/* ------------------------------------------------------------------ Horizon */

type HorizonOp = {
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful: boolean;
  parameters?: { value: string; type: string }[];
};

/** Map a decoded contract invocation onto a history row. */
function classify(
  contractId: string,
  fn: string,
  args: unknown[],
): Pick<HistoryEntry, "kind" | "amount" | "counterparty" | "saveBps"> | null {
  const { router, vault, token } = config.contracts;
  const big = (v: unknown) => (typeof v === "bigint" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  if (contractId === router && fn === "route") {
    return { kind: "sent", counterparty: str(args[1]), amount: big(args[2]) };
  }
  if (contractId === router && fn === "set_rule") {
    return { kind: "rule", saveBps: Number(args[1] ?? 0) };
  }
  if (contractId === vault && fn === "withdraw") {
    return { kind: "withdraw", amount: big(args[1]) };
  }
  if (contractId === vault && fn === "withdraw_all") {
    return { kind: "withdraw" };
  }
  if (contractId === vault && fn === "deposit") {
    return { kind: "deposit", amount: big(args[1]) };
  }
  if (contractId === token && fn === "faucet") {
    return { kind: "faucet" };
  }
  // Any other call against one of our contracts still deserves a row.
  if (contractId === router || contractId === vault || contractId === token) {
    return { kind: "other" };
  }
  return null;
}

/**
 * Everything this wallet signed, from full ledger history.
 *
 * Resolves in a single round trip, so the history page renders from this while
 * the slower event scan is still running.
 */
export async function fetchSignedHistory(
  address: string,
): Promise<HistoryEntry[]> {
  // Imported lazily: the XDR decoder is a heavy chunk, and only this path needs it.
  const { decodeScVal } = await import("./routed-events");

  const url =
    `${config.horizonUrl}/accounts/${address}/operations` +
    `?limit=${HORIZON_LIMIT}&order=desc&include_failed=true`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    // A wallet that has never been funded has no Horizon account yet — that is
    // an empty history, not an error.
    if (res.status === 404) return [];
    throw new Error(`Horizon ${res.status}`);
  }

  const body = (await res.json()) as { _embedded?: { records?: HorizonOp[] } };
  const entries: HistoryEntry[] = [];

  for (const op of body._embedded?.records ?? []) {
    if (op.type !== "invoke_host_function") continue;
    const params = op.parameters ?? [];
    // [contract address, function symbol, ...arguments]
    if (params.length < 2) continue;

    let contractId: string;
    let fn: string;
    let args: unknown[];
    try {
      contractId = String(decodeScVal(params[0].value));
      fn = String(decodeScVal(params[1].value));
      args = params.slice(2).map((p) => decodeScVal(p.value));
    } catch {
      continue; // Not a contract invocation we can read — skip it.
    }

    const classified = classify(contractId, fn, args);
    if (!classified) continue;

    entries.push({
      id: `${op.transaction_hash}:${classified.kind}`,
      txHash: op.transaction_hash,
      ts: Date.parse(op.created_at),
      success: op.transaction_successful,
      fn,
      ...classified,
    });
  }

  return entries;
}

/* ------------------------------------------------------------ routed events */

/**
 * Every remittance the router has settled inside the retention window.
 *
 * Scanning that window costs a fan-out of RPC calls, so it runs on the server
 * behind a short cache; this is the slow half of a history load.
 */
export async function fetchRoutedEvents(): Promise<RoutedEvent[]> {
  const res = await fetch("/api/routed");
  if (!res.ok) throw new Error(`routed feed ${res.status}`);
  const body = (await res.json()) as { events?: RoutedEventWire[] };
  return (body.events ?? []).map(fromWire);
}

/* ----------------------------------------------------------------- merging */

/**
 * Fold the router's events into a wallet's signed history: fill in the split on
 * its own sends, and add the incoming remittances that exist nowhere else.
 *
 * Pure and non-mutating, so the caller can re-run it whenever either half
 * arrives.
 */
export function mergeHistory(
  address: string,
  signed: HistoryEntry[],
  routed: RoutedEvent[],
): HistoryEntry[] {
  const splitByHash = new Map(routed.map((ev) => [ev.txHash, ev]));

  const entries: HistoryEntry[] = signed.map((entry) => {
    if (entry.kind !== "sent") return entry;
    const ev = splitByHash.get(entry.txHash);
    if (!ev) return entry;
    return {
      ...entry,
      payout: ev.payout,
      saved: ev.saved,
      amount: entry.amount ?? ev.amount,
    };
  });

  // Incoming remittances never touch the recipient's Horizon account, so the
  // event feed is the only place they exist.
  for (const ev of routed) {
    if (ev.recipient !== address) continue;
    entries.push({
      id: `${ev.txHash}:received`,
      txHash: ev.txHash,
      ts: ev.ts,
      ledger: ev.ledger,
      kind: "received",
      success: true,
      amount: ev.amount,
      payout: ev.payout,
      saved: ev.saved,
      counterparty: ev.sender,
      fn: "route",
    });
  }

  return entries.sort((a, b) => b.ts - a.ts);
}
