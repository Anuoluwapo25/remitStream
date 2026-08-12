// Decoding for the router's `Routed` contract events.
//
// Shared between the server-side scanner (app/api/routed) and the client, so
// both agree on the wire shape. Amounts cross the API boundary as strings
// because JSON has no integer type wide enough for an i128.

import { xdr, scValToNative } from "@stellar/stellar-sdk";

/** One remittance, as the chain recorded it. */
export type RoutedEvent = {
  txHash: string;
  ts: number;
  ledger?: number;
  sender: string;
  recipient: string;
  amount: bigint;
  payout: bigint;
  saved: bigint;
};

/** Wire form of {@link RoutedEvent}: i128 fields serialized as decimal strings. */
export type RoutedEventWire = Omit<
  RoutedEvent,
  "amount" | "payout" | "saved"
> & {
  amount: string;
  payout: string;
  saved: string;
};

/** The RPC's raw event record. Field names differ slightly across versions. */
export type RawEvent = {
  id?: string;
  txHash?: string;
  ledger?: number;
  ledgerClosedAt?: string;
  topic?: string[];
  topics?: string[];
  value?: string | { xdr?: string };
  inSuccessfulContractCall?: boolean;
};

export function decodeScVal(base64: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(base64, "base64"));
}

/**
 * Decode one raw RPC event into a `Routed` record, or null if it is a
 * different event.
 *
 * The router publishes `Routed { #[topic] sender, #[topic] recipient, amount,
 * payout, saved }`, which reaches the wire as three topics —
 * `[Symbol("routed"), sender, recipient]` — and a map-shaped data payload.
 * `RuleSet` shares the contract but carries only two topics, so the topic
 * count and name are both checked.
 */
export function parseRoutedEvent(ev: RawEvent): RoutedEvent | null {
  const topics = ev.topic ?? ev.topics ?? [];
  if (topics.length !== 3) return null;

  const rawValue = typeof ev.value === "string" ? ev.value : ev.value?.xdr;
  if (!rawValue || !ev.txHash) return null;

  try {
    if (decodeScVal(topics[0]) !== "routed") return null;
    const data = decodeScVal(rawValue) as {
      amount?: bigint;
      payout?: bigint;
      saved?: bigint;
    };
    return {
      txHash: ev.txHash,
      ts: ev.ledgerClosedAt ? Date.parse(ev.ledgerClosedAt) : Date.now(),
      ledger: ev.ledger,
      sender: String(decodeScVal(topics[1])),
      recipient: String(decodeScVal(topics[2])),
      amount: BigInt(data.amount ?? 0),
      payout: BigInt(data.payout ?? 0),
      saved: BigInt(data.saved ?? 0),
    };
  } catch {
    return null;
  }
}

export function toWire(ev: RoutedEvent): RoutedEventWire {
  return {
    ...ev,
    amount: ev.amount.toString(),
    payout: ev.payout.toString(),
    saved: ev.saved.toString(),
  };
}

export function fromWire(ev: RoutedEventWire): RoutedEvent {
  return {
    ...ev,
    amount: BigInt(ev.amount),
    payout: BigInt(ev.payout),
    saved: BigInt(ev.saved),
  };
}
