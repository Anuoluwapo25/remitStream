import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";


// Not yet deployed to testnet — contracts.ts requires NEXT_PUBLIC_CIRCLES_ID
// to be set explicitly before this client is used, rather than defaulting.
export const networks = {} as const

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"InvalidAmount"},
  /**
   * `size` is below `MIN_MEMBERS` or above `MAX_MEMBERS`.
   */
  2: {message:"InvalidSize"},
  /**
   * `round_seconds` was zero.
   */
  3: {message:"InvalidRoundLength"},
  /**
   * A name is empty or longer than `MAX_NAME_LEN`.
   */
  4: {message:"InvalidName"},
  5: {message:"CircleNotFound"},
  /**
   * The circle already has all its members and started its first round.
   */
  6: {message:"CircleFull"},
  /**
   * This address is already a member of this circle.
   */
  7: {message:"AlreadyMember"},
  /**
   * This address is not a member of this circle.
   */
  8: {message:"NotAMember"},
  /**
   * The circle is still filling its member slots.
   */
  9: {message:"StillForming"},
  /**
   * The circle already finished — every member has been paid once.
   */
  10: {message:"AlreadyCompleted"},
  /**
   * This member has already paid into the current round.
   */
  11: {message:"AlreadyContributed"},
  /**
   * This member has nothing to reclaim in the current round.
   */
  12: {message:"NothingToReclaim"},
  /**
   * The round's grace period hasn't passed yet — it isn't reclaimable.
   */
  13: {message:"RoundStillOpen"}
}


/**
 * A rotating savings circle.
 */
export interface Circle {
  /**
 * Aligned with `members`: who has paid into the current round.
 */
contributed: Array<boolean>;
  /**
 * What each member pays in per round.
 */
contribution: i128;
  /**
 * Index into `members` of the round currently in progress.
 */
current_round: u32;
  /**
 * Join order, which is also payout order: `members[current_round]` is
 * this round's recipient. Fixed once the circle is full.
 */
members: Array<string>;
  name: string;
  /**
 * Minimum time a round stays open before a stalled contribution can be
 * reclaimed. Does not force a round closed — a round only ever settles
 * when every member has paid in.
 */
round_seconds: u64;
  /**
 * Unix seconds the current round opened. 0 while still `Forming`.
 */
round_start: u64;
  size: u32;
  status: CircleStatus;
  token: string;
}

export type DataKey = {tag: "NextId", values: void} | {tag: "Circle", values: readonly [u64]};


/**
 * Lifecycle of a circle.
 */
export type CircleStatus = {tag: "Forming", values: void} | {tag: "Active", values: void} | {tag: "Completed", values: void};





export interface Client {
  /**
   * Construct and simulate a contribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pay into the circle's current round. Once every member has, the whole
   * pot moves in this same call to whichever member's turn it is, and the
   * next round opens.
   */
  contribute: ({member, circle_id}: {member: string, circle_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_circle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_circle: ({circle_id}: {circle_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Circle>>

  /**
   * Construct and simulate a join_circle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Join a forming circle. Join order is payout order: the first to join
   * after the creator is paid in round 1, and so on. Filling the last
   * slot starts round 0 immediately.
   */
  join_circle: ({member, circle_id}: {member: string, circle_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_circle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new circle. The creator becomes its first member. Returns the
   * circle's id; share it with the people you're forming this with, who
   * join with `join_circle`.
   */
  create_circle: ({creator, token, name, contribution, round_seconds, size}: {creator: string, token: string, name: string, contribution: i128, round_seconds: u64, size: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a reclaim_stalled_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Take back a contribution already paid into the current, still-open
   * round, once the round has been open longer than `round_seconds` with
   * no full settlement. Protects members from a circle stalled by
   * whoever hasn't paid in yet — it does not skip or punish anyone, it
   * just lets you stop waiting on them.
   */
  reclaim_stalled_round: ({member, circle_id}: {member: string, circle_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAEAAAA1YHNpemVgIGlzIGJlbG93IGBNSU5fTUVNQkVSU2Agb3IgYWJvdmUgYE1BWF9NRU1CRVJTYC4AAAAAAAALSW52YWxpZFNpemUAAAAAAgAAABlgcm91bmRfc2Vjb25kc2Agd2FzIHplcm8uAAAAAAAAEkludmFsaWRSb3VuZExlbmd0aAAAAAAAAwAAAC5BIG5hbWUgaXMgZW1wdHkgb3IgbG9uZ2VyIHRoYW4gYE1BWF9OQU1FX0xFTmAuAAAAAAALSW52YWxpZE5hbWUAAAAABAAAAAAAAAAOQ2lyY2xlTm90Rm91bmQAAAAAAAUAAABDVGhlIGNpcmNsZSBhbHJlYWR5IGhhcyBhbGwgaXRzIG1lbWJlcnMgYW5kIHN0YXJ0ZWQgaXRzIGZpcnN0IHJvdW5kLgAAAAAKQ2lyY2xlRnVsbAAAAAAABgAAADBUaGlzIGFkZHJlc3MgaXMgYWxyZWFkeSBhIG1lbWJlciBvZiB0aGlzIGNpcmNsZS4AAAANQWxyZWFkeU1lbWJlcgAAAAAAAAcAAAAsVGhpcyBhZGRyZXNzIGlzIG5vdCBhIG1lbWJlciBvZiB0aGlzIGNpcmNsZS4AAAAKTm90QU1lbWJlcgAAAAAACAAAAC1UaGUgY2lyY2xlIGlzIHN0aWxsIGZpbGxpbmcgaXRzIG1lbWJlciBzbG90cy4AAAAAAAAMU3RpbGxGb3JtaW5nAAAACQAAAEBUaGUgY2lyY2xlIGFscmVhZHkgZmluaXNoZWQg4oCUIGV2ZXJ5IG1lbWJlciBoYXMgYmVlbiBwYWlkIG9uY2UuAAAAEEFscmVhZHlDb21wbGV0ZWQAAAAKAAAANFRoaXMgbWVtYmVyIGhhcyBhbHJlYWR5IHBhaWQgaW50byB0aGUgY3VycmVudCByb3VuZC4AAAASQWxyZWFkeUNvbnRyaWJ1dGVkAAAAAAALAAAAOFRoaXMgbWVtYmVyIGhhcyBub3RoaW5nIHRvIHJlY2xhaW0gaW4gdGhlIGN1cnJlbnQgcm91bmQuAAAAEE5vdGhpbmdUb1JlY2xhaW0AAAAMAAAARFRoZSByb3VuZCdzIGdyYWNlIHBlcmlvZCBoYXNuJ3QgcGFzc2VkIHlldCDigJQgaXQgaXNuJ3QgcmVjbGFpbWFibGUuAAAADlJvdW5kU3RpbGxPcGVuAAAAAAAN",
        "AAAAAQAAABpBIHJvdGF0aW5nIHNhdmluZ3MgY2lyY2xlLgAAAAAAAAAAAAZDaXJjbGUAAAAAAAoAAAA8QWxpZ25lZCB3aXRoIGBtZW1iZXJzYDogd2hvIGhhcyBwYWlkIGludG8gdGhlIGN1cnJlbnQgcm91bmQuAAAAC2NvbnRyaWJ1dGVkAAAAA+oAAAABAAAAI1doYXQgZWFjaCBtZW1iZXIgcGF5cyBpbiBwZXIgcm91bmQuAAAAAAxjb250cmlidXRpb24AAAALAAAAOEluZGV4IGludG8gYG1lbWJlcnNgIG9mIHRoZSByb3VuZCBjdXJyZW50bHkgaW4gcHJvZ3Jlc3MuAAAADWN1cnJlbnRfcm91bmQAAAAAAAAEAAAAekpvaW4gb3JkZXIsIHdoaWNoIGlzIGFsc28gcGF5b3V0IG9yZGVyOiBgbWVtYmVyc1tjdXJyZW50X3JvdW5kXWAgaXMKdGhpcyByb3VuZCdzIHJlY2lwaWVudC4gRml4ZWQgb25jZSB0aGUgY2lyY2xlIGlzIGZ1bGwuAAAAAAAHbWVtYmVycwAAAAPqAAAAEwAAAAAAAAAEbmFtZQAAABAAAACqTWluaW11bSB0aW1lIGEgcm91bmQgc3RheXMgb3BlbiBiZWZvcmUgYSBzdGFsbGVkIGNvbnRyaWJ1dGlvbiBjYW4gYmUKcmVjbGFpbWVkLiBEb2VzIG5vdCBmb3JjZSBhIHJvdW5kIGNsb3NlZCDigJQgYSByb3VuZCBvbmx5IGV2ZXIgc2V0dGxlcwp3aGVuIGV2ZXJ5IG1lbWJlciBoYXMgcGFpZCBpbi4AAAAAAA1yb3VuZF9zZWNvbmRzAAAAAAAABgAAAD9Vbml4IHNlY29uZHMgdGhlIGN1cnJlbnQgcm91bmQgb3BlbmVkLiAwIHdoaWxlIHN0aWxsIGBGb3JtaW5nYC4AAAAAC3JvdW5kX3N0YXJ0AAAAAAYAAAAAAAAABHNpemUAAAAEAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAMQ2lyY2xlU3RhdHVzAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAAAAAAAAAAABk5leHRJZAAAAAAAAQAAAAAAAAAGQ2lyY2xlAAAAAAABAAAABg==",
        "AAAABQAAAAAAAAAAAAAAC0NvbnRyaWJ1dGVkAAAAAAEAAAALY29udHJpYnV0ZWQAAAAAAwAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAAAAAAAAJY2lyY2xlX2lkAAAAAAAABgAAAAAAAAAAAAAABXJvdW5kAAAAAAAABAAAAAAAAAAC",
        "AAAAAgAAABZMaWZlY3ljbGUgb2YgYSBjaXJjbGUuAAAAAAAAAAAADENpcmNsZVN0YXR1cwAAAAMAAAAAAAAAJlN0aWxsIHJlY3J1aXRpbmcgbWVtYmVycyB1cCB0byBgc2l6ZWAuAAAAAAAHRm9ybWluZwAAAAAAAAAAGUZ1bGwuIFJvdW5kcyBhcmUgcnVubmluZy4AAAAAAAAGQWN0aXZlAAAAAAAAAAAAL0V2ZXJ5IG1lbWJlciBoYXMgcmVjZWl2ZWQgdGhlIHBvdCBleGFjdGx5IG9uY2UuAAAAAAlDb21wbGV0ZWQAAAA=",
        "AAAABQAAAAAAAAAAAAAADE1lbWJlckpvaW5lZAAAAAEAAAANbWVtYmVyX2pvaW5lZAAAAAAAAAMAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAEAAAAAAAAACWNpcmNsZV9pZAAAAAAAAAYAAAAAAAAAO1RydWUgaWYgdGhpcyBqb2luIGZpbGxlZCB0aGUgbGFzdCBzbG90IGFuZCBzdGFydGVkIHJvdW5kIDAuAAAAAAlhY3RpdmF0ZWQAAAAAAAABAAAAAAAAAAI=",
        "AAAABQAAAEhFbWl0dGVkIG9uY2UgcGVyIHJvdW5kLCB3aGVuIGV2ZXJ5IG1lbWJlciBoYXMgcGFpZCBpbiBhbmQgdGhlIHBvdCBtb3Zlcy4AAAAAAAAADFJvdW5kU2V0dGxlZAAAAAEAAAANcm91bmRfc2V0dGxlZAAAAAAAAAQAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAAAAAAAAljaXJjbGVfaWQAAAAAAAAGAAAAAAAAAAAAAAAFcm91bmQAAAAAAAAEAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADUNpcmNsZUNyZWF0ZWQAAAAAAAABAAAADmNpcmNsZV9jcmVhdGVkAAAAAAAEAAAAAAAAAAdjcmVhdG9yAAAAABMAAAABAAAAAAAAAAljaXJjbGVfaWQAAAAAAAAGAAAAAAAAAAAAAAAMY29udHJpYnV0aW9uAAAACwAAAAAAAAAAAAAABHNpemUAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAD0NpcmNsZUNvbXBsZXRlZAAAAAABAAAAEGNpcmNsZV9jb21wbGV0ZWQAAAABAAAAAAAAAAljaXJjbGVfaWQAAAAAAAAGAAAAAQAAAAI=",
        "AAAAAAAAAJ1QYXkgaW50byB0aGUgY2lyY2xlJ3MgY3VycmVudCByb3VuZC4gT25jZSBldmVyeSBtZW1iZXIgaGFzLCB0aGUgd2hvbGUKcG90IG1vdmVzIGluIHRoaXMgc2FtZSBjYWxsIHRvIHdoaWNoZXZlciBtZW1iZXIncyB0dXJuIGl0IGlzLCBhbmQgdGhlCm5leHQgcm91bmQgb3BlbnMuAAAAAAAACmNvbnRyaWJ1dGUAAAAAAAIAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAAAAAAJY2lyY2xlX2lkAAAAAAAABgAAAAA=",
        "AAAAAAAAAAAAAAAKZ2V0X2NpcmNsZQAAAAAAAQAAAAAAAAAJY2lyY2xlX2lkAAAAAAAABgAAAAEAAAfQAAAABkNpcmNsZQAA",
        "AAAAAAAAAKdKb2luIGEgZm9ybWluZyBjaXJjbGUuIEpvaW4gb3JkZXIgaXMgcGF5b3V0IG9yZGVyOiB0aGUgZmlyc3QgdG8gam9pbgphZnRlciB0aGUgY3JlYXRvciBpcyBwYWlkIGluIHJvdW5kIDEsIGFuZCBzbyBvbi4gRmlsbGluZyB0aGUgbGFzdApzbG90IHN0YXJ0cyByb3VuZCAwIGltbWVkaWF0ZWx5LgAAAAALam9pbl9jaXJjbGUAAAAAAgAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAAAAAAljaXJjbGVfaWQAAAAAAAAGAAAAAA==",
        "AAAAAAAAAKJTdGFydCBhIG5ldyBjaXJjbGUuIFRoZSBjcmVhdG9yIGJlY29tZXMgaXRzIGZpcnN0IG1lbWJlci4gUmV0dXJucyB0aGUKY2lyY2xlJ3MgaWQ7IHNoYXJlIGl0IHdpdGggdGhlIHBlb3BsZSB5b3UncmUgZm9ybWluZyB0aGlzIHdpdGgsIHdobwpqb2luIHdpdGggYGpvaW5fY2lyY2xlYC4AAAAAAA1jcmVhdGVfY2lyY2xlAAAAAAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAxjb250cmlidXRpb24AAAALAAAAAAAAAA1yb3VuZF9zZWNvbmRzAAAAAAAABgAAAAAAAAAEc2l6ZQAAAAQAAAABAAAABg==",
        "AAAAAAAAAS5UYWtlIGJhY2sgYSBjb250cmlidXRpb24gYWxyZWFkeSBwYWlkIGludG8gdGhlIGN1cnJlbnQsIHN0aWxsLW9wZW4Kcm91bmQsIG9uY2UgdGhlIHJvdW5kIGhhcyBiZWVuIG9wZW4gbG9uZ2VyIHRoYW4gYHJvdW5kX3NlY29uZHNgIHdpdGgKbm8gZnVsbCBzZXR0bGVtZW50LiBQcm90ZWN0cyBtZW1iZXJzIGZyb20gYSBjaXJjbGUgc3RhbGxlZCBieQp3aG9ldmVyIGhhc24ndCBwYWlkIGluIHlldCDigJQgaXQgZG9lcyBub3Qgc2tpcCBvciBwdW5pc2ggYW55b25lLCBpdApqdXN0IGxldHMgeW91IHN0b3Agd2FpdGluZyBvbiB0aGVtLgAAAAAAFXJlY2xhaW1fc3RhbGxlZF9yb3VuZAAAAAAAAAIAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAAAAAAJY2lyY2xlX2lkAAAAAAAABgAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    contribute: this.txFromJSON<null>,
        get_circle: this.txFromJSON<Circle>,
        join_circle: this.txFromJSON<null>,
        create_circle: this.txFromJSON<u64>,
        reclaim_stalled_round: this.txFromJSON<null>
  }
}