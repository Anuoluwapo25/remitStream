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


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L",
  }
} as const

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * A single savings goal owned by a recipient.
 */
export interface Goal {
  /**
 * Slice of every inbound remittance aimed at this goal, in basis points.
 */
allocation_bps: u32;
  /**
 * Informational deadline as a unix timestamp. `0` means none.
 * Not enforced on-chain — the UI uses it for a countdown.
 */
deadline: u64;
  id: u32;
  name: string;
  /**
 * Principal routed into this goal so far. Excludes vault yield.
 */
saved: i128;
  status: GoalStatus;
  /**
 * Target in token base units. `0` means open-ended (no cap).
 */
target: i128;
}


/**
 * Back-compatible flat rule, derived from the active goal allocations.
 */
export interface Rule {
  enabled: boolean;
  save_bps: u32;
}

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidAmount"},
  /**
   * A basis-points value is above 10_000, or the total across active goals would be.
   */
  4: {message:"InvalidSplit"},
  /**
   * Sender and recipient must differ.
   */
  5: {message:"SelfTransfer"},
  /**
   * No goal with that id belongs to the caller.
   */
  6: {message:"GoalNotFound"},
  /**
   * The recipient already has `MAX_GOALS` non-archived goals.
   */
  7: {message:"TooManyGoals"},
  /**
   * A reorder list is not a permutation of the caller's current goal ids.
   */
  8: {message:"BadReorder"},
  /**
   * A goal name is empty or longer than `MAX_NAME_LEN`.
   */
  9: {message:"InvalidName"}
}


/**
 * Result of a split, returned to the caller so the UI can show the breakdown.
 */
export interface Split {
  payout: i128;
  saved: i128;
}


/**
 * Lifetime totals per recipient, used by the dashboard.
 */
export interface Stats {
  total_received: i128;
  total_saved: i128;
  transfers: u32;
}


export interface Config {
  admin: string;
  token: string;
  vault: string;
}


export type DataKey = {tag: "Config", values: void} | {tag: "Goals", values: readonly [string]} | {tag: "NextId", values: readonly [string]} | {tag: "Stats", values: readonly [string]};



/**
 * One goal's share of a specific split. Returned by `quote_plan` and mirrored
 * by the `GoalFunded` events `route` emits.
 */
export interface GoalFill {
  amount: i128;
  goal_id: u32;
  name: string;
  /**
 * True if this contribution takes the goal to its target.
 */
reaches_target: boolean;
}

/**
 * Lifecycle of a goal.
 */
export type GoalStatus = {tag: "Active", values: void} | {tag: "Reached", values: void} | {tag: "Archived", values: void};




export interface Client {
  /**
   * Construct and simulate a quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Preview a split without moving funds — used by the UI before confirmation.
   */
  quote: ({recipient, amount}: {recipient: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Split>>

  /**
   * Construct and simulate a route transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Send `amount` to `recipient`, splitting it across the recipient's goals.
   * 
   * The router pulls the full amount, forwards the unsaved remainder to the
   * recipient's wallet, pushes the saved part into the vault, and credits the
   * recipient's shares. Only the sender signs.
   */
  route: ({sender, recipient, amount}: {sender: string, recipient: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Split>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a add_goal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a savings goal owned by `owner`. Returns the new goal's id.
   * 
   * `target` is in token base units; `0` means open-ended. `deadline` is a
   * unix timestamp used only for display; pass `0` for none. `allocation_bps`
   * is this goal's slice of every inbound transfer — the sum across all
   * active goals may not exceed 100%.
   */
  add_goal: ({owner, name, target, deadline, allocation_bps}: {owner: string, name: string, target: i128, deadline: u64, allocation_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The caller's effective flat rate: the sum of active goal allocations,
   * capped at 100%.
   */
  get_rule: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Rule>>

  /**
   * Construct and simulate a set_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the caller's savings rate as a single percentage (basis points).
   * 
   * This is sugar over one goal named "Savings": it creates that goal, or
   * updates its allocation, or archives it when `save_bps` is 0. Recipients
   * with hand-built goals should use `set_goal_allocation` instead.
   */
  set_rule: ({recipient, save_bps}: {recipient: string, save_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_goals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_goals: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Goal>>>

  /**
   * Construct and simulate a get_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_stats: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Stats>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, vault, token}: {admin: string, vault: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a quote_plan transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Preview which goals a transfer would feed, and by how much. The amounts
   * sum to `quote(recipient, amount).saved`.
   */
  quote_plan: ({recipient, amount}: {recipient: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Array<GoalFill>>>

  /**
   * Construct and simulate a update_goal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace a goal's editable fields. Raising the target above what's already
   * saved reactivates a goal that had been marked `Reached`.
   */
  update_goal: ({owner, goal_id, name, target, deadline, allocation_bps}: {owner: string, goal_id: u32, name: string, target: i128, deadline: u64, allocation_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a archive_goal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retire a goal. Its allocation is freed for other goals; the principal it
   * already holds stays in the vault and is still withdrawable.
   */
  archive_goal: ({owner, goal_id}: {owner: string, goal_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a reorder_goals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the priority order of the caller's goals. `order` must be a
   * permutation of the caller's current goal ids. Earlier goals fill first.
   */
  reorder_goals: ({owner, order}: {owner: string, order: Array<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_goal_allocation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Convenience: change only a goal's allocation. Handy for a slider.
   */
  set_goal_allocation: ({owner, goal_id, allocation_bps}: {owner: string, goal_id: u32, allocation_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAQAAACtBIHNpbmdsZSBzYXZpbmdzIGdvYWwgb3duZWQgYnkgYSByZWNpcGllbnQuAAAAAAAAAAAER29hbAAAAAcAAABGU2xpY2Ugb2YgZXZlcnkgaW5ib3VuZCByZW1pdHRhbmNlIGFpbWVkIGF0IHRoaXMgZ29hbCwgaW4gYmFzaXMgcG9pbnRzLgAAAAAADmFsbG9jYXRpb25fYnBzAAAAAAAEAAAAdUluZm9ybWF0aW9uYWwgZGVhZGxpbmUgYXMgYSB1bml4IHRpbWVzdGFtcC4gYDBgIG1lYW5zIG5vbmUuCk5vdCBlbmZvcmNlZCBvbi1jaGFpbiDigJQgdGhlIFVJIHVzZXMgaXQgZm9yIGEgY291bnRkb3duLgAAAAAAAAhkZWFkbGluZQAAAAYAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAARuYW1lAAAAEAAAAD1QcmluY2lwYWwgcm91dGVkIGludG8gdGhpcyBnb2FsIHNvIGZhci4gRXhjbHVkZXMgdmF1bHQgeWllbGQuAAAAAAAABXNhdmVkAAAAAAAACwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAACkdvYWxTdGF0dXMAAAAAADpUYXJnZXQgaW4gdG9rZW4gYmFzZSB1bml0cy4gYDBgIG1lYW5zIG9wZW4tZW5kZWQgKG5vIGNhcCkuAAAAAAAGdGFyZ2V0AAAAAAAL",
        "AAAAAQAAAERCYWNrLWNvbXBhdGlibGUgZmxhdCBydWxlLCBkZXJpdmVkIGZyb20gdGhlIGFjdGl2ZSBnb2FsIGFsbG9jYXRpb25zLgAAAAAAAAAEUnVsZQAAAAIAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAIc2F2ZV9icHMAAAAE",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAABQQSBiYXNpcy1wb2ludHMgdmFsdWUgaXMgYWJvdmUgMTBfMDAwLCBvciB0aGUgdG90YWwgYWNyb3NzIGFjdGl2ZSBnb2FscyB3b3VsZCBiZS4AAAAMSW52YWxpZFNwbGl0AAAABAAAACFTZW5kZXIgYW5kIHJlY2lwaWVudCBtdXN0IGRpZmZlci4AAAAAAAAMU2VsZlRyYW5zZmVyAAAABQAAACtObyBnb2FsIHdpdGggdGhhdCBpZCBiZWxvbmdzIHRvIHRoZSBjYWxsZXIuAAAAAAxHb2FsTm90Rm91bmQAAAAGAAAAOVRoZSByZWNpcGllbnQgYWxyZWFkeSBoYXMgYE1BWF9HT0FMU2Agbm9uLWFyY2hpdmVkIGdvYWxzLgAAAAAAAAxUb29NYW55R29hbHMAAAAHAAAARUEgcmVvcmRlciBsaXN0IGlzIG5vdCBhIHBlcm11dGF0aW9uIG9mIHRoZSBjYWxsZXIncyBjdXJyZW50IGdvYWwgaWRzLgAAAAAAAApCYWRSZW9yZGVyAAAAAAAIAAAAM0EgZ29hbCBuYW1lIGlzIGVtcHR5IG9yIGxvbmdlciB0aGFuIGBNQVhfTkFNRV9MRU5gLgAAAAALSW52YWxpZE5hbWUAAAAACQ==",
        "AAAAAQAAAEtSZXN1bHQgb2YgYSBzcGxpdCwgcmV0dXJuZWQgdG8gdGhlIGNhbGxlciBzbyB0aGUgVUkgY2FuIHNob3cgdGhlIGJyZWFrZG93bi4AAAAAAAAAAAVTcGxpdAAAAAAAAAIAAAAAAAAABnBheW91dAAAAAAACwAAAAAAAAAFc2F2ZWQAAAAAAAAL",
        "AAAAAQAAADVMaWZldGltZSB0b3RhbHMgcGVyIHJlY2lwaWVudCwgdXNlZCBieSB0aGUgZGFzaGJvYXJkLgAAAAAAAAAAAAAFU3RhdHMAAAAAAAADAAAAAAAAAA50b3RhbF9yZWNlaXZlZAAAAAAACwAAAAAAAAALdG90YWxfc2F2ZWQAAAAACwAAAAAAAAAJdHJhbnNmZXJzAAAAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABXZhdWx0AAAAAAAAEw==",
        "AAAABQAAAJdFbWl0dGVkIGZvciBldmVyeSByb3V0ZWQgcmVtaXR0YW5jZS4gSW5kZXhlZCBieSBib3RoIHBhcnRpZXMgc28gdGhlIGRhc2hib2FyZApjYW4gcXVlcnkgYSB1c2VyJ3Mgc2VudCBhbmQgcmVjZWl2ZWQgaGlzdG9yeS4gU2hhcGUgaXMgdW5jaGFuZ2VkIGZyb20gdjEuAAAAAAAAAAAGUm91dGVkAAAAAAABAAAABnJvdXRlZAAAAAAABQAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAABnBheW91dAAAAAAACwAAAAAAAAAAAAAABXNhdmVkAAAAAAAACwAAAAAAAAAC",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAQAAAAAAAAAFR29hbHMAAAAAAAABAAAAEwAAAAEAAAAAAAAABk5leHRJZAAAAAAAAQAAABMAAAABAAAAAAAAAAVTdGF0cwAAAAAAAAEAAAAT",
        "AAAABQAAAEBFbWl0dGVkIHdoZW4gYSByZWNpcGllbnQgY2hhbmdlcyB0aGVpciBmbGF0IHJ1bGUgdmlhIGBzZXRfcnVsZWAuAAAAAAAAAAdSdWxlU2V0AAAAAAEAAAAIcnVsZV9zZXQAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAAAAAAAAIc2F2ZV9icHMAAAAEAAAAAAAAAAI=",
        "AAAAAQAAAHVPbmUgZ29hbCdzIHNoYXJlIG9mIGEgc3BlY2lmaWMgc3BsaXQuIFJldHVybmVkIGJ5IGBxdW90ZV9wbGFuYCBhbmQgbWlycm9yZWQKYnkgdGhlIGBHb2FsRnVuZGVkYCBldmVudHMgYHJvdXRlYCBlbWl0cy4AAAAAAAAAAAAACEdvYWxGaWxsAAAABAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAdnb2FsX2lkAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAN1RydWUgaWYgdGhpcyBjb250cmlidXRpb24gdGFrZXMgdGhlIGdvYWwgdG8gaXRzIHRhcmdldC4AAAAADnJlYWNoZXNfdGFyZ2V0AAAAAAAB",
        "AAAAAgAAABRMaWZlY3ljbGUgb2YgYSBnb2FsLgAAAAAAAAAKR29hbFN0YXR1cwAAAAAAAwAAAAAAAAApVGFraW5nIGEgc2xpY2Ugb2YgZXZlcnkgaW5ib3VuZCB0cmFuc2Zlci4AAAAAAAAGQWN0aXZlAAAAAAAAAAAAOlRhcmdldCBtZXQuIFNraXBwZWQgYnkgYHJvdXRlYCB1bnRpbCB0aGUgdGFyZ2V0IGlzIHJhaXNlZC4AAAAAAAdSZWFjaGVkAAAAAAAAAAArUmV0aXJlZCBieSB0aGUgb3duZXIuIEZyZWVzIGl0cyBhbGxvY2F0aW9uLgAAAAAIQXJjaGl2ZWQ=",
        "AAAABQAAAEBFbWl0dGVkIG9uY2UgcGVyIGdvYWwgdGhhdCByZWNlaXZlcyBmdW5kcyBkdXJpbmcgYSBgcm91dGVgIGNhbGwuAAAAAAAAAApHb2FsRnVuZGVkAAAAAAABAAAAC2dvYWxfZnVuZGVkAAAAAAYAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAEAAAAAAAAAB2dvYWxfaWQAAAAABAAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAC3NhdmVkX2FmdGVyAAAAAAsAAAAAAAAAAAAAAAdyZWFjaGVkAAAAAAEAAAAAAAAAAg==",
        "AAAABQAAAChFbWl0dGVkIHdoZW4gYSByZWNpcGllbnQgY3JlYXRlcyBhIGdvYWwuAAAAAAAAAAtHb2FsQ3JlYXRlZAAAAAABAAAADGdvYWxfY3JlYXRlZAAAAAUAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAAB2dvYWxfaWQAAAAABAAAAAAAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAGdGFyZ2V0AAAAAAALAAAAAAAAAAAAAAAOYWxsb2NhdGlvbl9icHMAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAADxFbWl0dGVkIHdoZW4gYSBnb2FsJ3MgdGFyZ2V0LCBhbGxvY2F0aW9uLCBvciBzdGF0dXMgY2hhbmdlcy4AAAAAAAAAC0dvYWxVcGRhdGVkAAAAAAEAAAAMZ29hbF91cGRhdGVkAAAABQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAAAAAAAAHZ29hbF9pZAAAAAAEAAAAAAAAAAAAAAAGdGFyZ2V0AAAAAAALAAAAAAAAAAAAAAAOYWxsb2NhdGlvbl9icHMAAAAAAAQAAAAAAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAKR29hbFN0YXR1cwAAAAAAAAAAAAI=",
        "AAAAAAAAAExQcmV2aWV3IGEgc3BsaXQgd2l0aG91dCBtb3ZpbmcgZnVuZHMg4oCUIHVzZWQgYnkgdGhlIFVJIGJlZm9yZSBjb25maXJtYXRpb24uAAAABXF1b3RlAAAAAAAAAgAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAB9AAAAAFU3BsaXQAAAA=",
        "AAAAAAAAAQZTZW5kIGBhbW91bnRgIHRvIGByZWNpcGllbnRgLCBzcGxpdHRpbmcgaXQgYWNyb3NzIHRoZSByZWNpcGllbnQncyBnb2Fscy4KClRoZSByb3V0ZXIgcHVsbHMgdGhlIGZ1bGwgYW1vdW50LCBmb3J3YXJkcyB0aGUgdW5zYXZlZCByZW1haW5kZXIgdG8gdGhlCnJlY2lwaWVudCdzIHdhbGxldCwgcHVzaGVzIHRoZSBzYXZlZCBwYXJ0IGludG8gdGhlIHZhdWx0LCBhbmQgY3JlZGl0cyB0aGUKcmVjaXBpZW50J3Mgc2hhcmVzLiBPbmx5IHRoZSBzZW5kZXIgc2lnbnMuAAAAAAAFcm91dGUAAAAAAAADAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAfQAAAABVNwbGl0AAAA",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAATxDcmVhdGUgYSBzYXZpbmdzIGdvYWwgb3duZWQgYnkgYG93bmVyYC4gUmV0dXJucyB0aGUgbmV3IGdvYWwncyBpZC4KCmB0YXJnZXRgIGlzIGluIHRva2VuIGJhc2UgdW5pdHM7IGAwYCBtZWFucyBvcGVuLWVuZGVkLiBgZGVhZGxpbmVgIGlzIGEKdW5peCB0aW1lc3RhbXAgdXNlZCBvbmx5IGZvciBkaXNwbGF5OyBwYXNzIGAwYCBmb3Igbm9uZS4gYGFsbG9jYXRpb25fYnBzYAppcyB0aGlzIGdvYWwncyBzbGljZSBvZiBldmVyeSBpbmJvdW5kIHRyYW5zZmVyIOKAlCB0aGUgc3VtIGFjcm9zcyBhbGwKYWN0aXZlIGdvYWxzIG1heSBub3QgZXhjZWVkIDEwMCUuAAAACGFkZF9nb2FsAAAABQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGdGFyZ2V0AAAAAAALAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAAAAAADmFsbG9jYXRpb25fYnBzAAAAAAAEAAAAAQAAAAQ=",
        "AAAAAAAAAFVUaGUgY2FsbGVyJ3MgZWZmZWN0aXZlIGZsYXQgcmF0ZTogdGhlIHN1bSBvZiBhY3RpdmUgZ29hbCBhbGxvY2F0aW9ucywKY2FwcGVkIGF0IDEwMCUuAAAAAAAACGdldF9ydWxlAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAEAAAfQAAAABFJ1bGU=",
        "AAAAAAAAARNTZXQgdGhlIGNhbGxlcidzIHNhdmluZ3MgcmF0ZSBhcyBhIHNpbmdsZSBwZXJjZW50YWdlIChiYXNpcyBwb2ludHMpLgoKVGhpcyBpcyBzdWdhciBvdmVyIG9uZSBnb2FsIG5hbWVkICJTYXZpbmdzIjogaXQgY3JlYXRlcyB0aGF0IGdvYWwsIG9yCnVwZGF0ZXMgaXRzIGFsbG9jYXRpb24sIG9yIGFyY2hpdmVzIGl0IHdoZW4gYHNhdmVfYnBzYCBpcyAwLiBSZWNpcGllbnRzCndpdGggaGFuZC1idWlsdCBnb2FscyBzaG91bGQgdXNlIGBzZXRfZ29hbF9hbGxvY2F0aW9uYCBpbnN0ZWFkLgAAAAAIc2V0X3J1bGUAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAhzYXZlX2JwcwAAAAQAAAAA",
        "AAAAAAAAAAAAAAAJZ2V0X2dvYWxzAAAAAAAAAQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAA+oAAAfQAAAABEdvYWw=",
        "AAAAAAAAAAAAAAAJZ2V0X3N0YXRzAAAAAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAEAAAfQAAAABVN0YXRzAAAA",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAAHBQcmV2aWV3IHdoaWNoIGdvYWxzIGEgdHJhbnNmZXIgd291bGQgZmVlZCwgYW5kIGJ5IGhvdyBtdWNoLiBUaGUgYW1vdW50cwpzdW0gdG8gYHF1b3RlKHJlY2lwaWVudCwgYW1vdW50KS5zYXZlZGAuAAAACnF1b3RlX3BsYW4AAAAAAAIAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPqAAAH0AAAAAhHb2FsRmlsbA==",
        "AAAAAAAAAIJSZXBsYWNlIGEgZ29hbCdzIGVkaXRhYmxlIGZpZWxkcy4gUmFpc2luZyB0aGUgdGFyZ2V0IGFib3ZlIHdoYXQncyBhbHJlYWR5CnNhdmVkIHJlYWN0aXZhdGVzIGEgZ29hbCB0aGF0IGhhZCBiZWVuIG1hcmtlZCBgUmVhY2hlZGAuAAAAAAALdXBkYXRlX2dvYWwAAAAABgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAdnb2FsX2lkAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZ0YXJnZXQAAAAAAAsAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAAOYWxsb2NhdGlvbl9icHMAAAAAAAQAAAAA",
        "AAAAAAAAAIRSZXRpcmUgYSBnb2FsLiBJdHMgYWxsb2NhdGlvbiBpcyBmcmVlZCBmb3Igb3RoZXIgZ29hbHM7IHRoZSBwcmluY2lwYWwgaXQKYWxyZWFkeSBob2xkcyBzdGF5cyBpbiB0aGUgdmF1bHQgYW5kIGlzIHN0aWxsIHdpdGhkcmF3YWJsZS4AAAAMYXJjaGl2ZV9nb2FsAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAdnb2FsX2lkAAAAAAQAAAAA",
        "AAAAAAAAAIdTZXQgdGhlIHByaW9yaXR5IG9yZGVyIG9mIHRoZSBjYWxsZXIncyBnb2Fscy4gYG9yZGVyYCBtdXN0IGJlIGEKcGVybXV0YXRpb24gb2YgdGhlIGNhbGxlcidzIGN1cnJlbnQgZ29hbCBpZHMuIEVhcmxpZXIgZ29hbHMgZmlsbCBmaXJzdC4AAAAADXJlb3JkZXJfZ29hbHMAAAAAAAACAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAABW9yZGVyAAAAAAAD6gAAAAQAAAAA",
        "AAAAAAAAAEFDb252ZW5pZW5jZTogY2hhbmdlIG9ubHkgYSBnb2FsJ3MgYWxsb2NhdGlvbi4gSGFuZHkgZm9yIGEgc2xpZGVyLgAAAAAAABNzZXRfZ29hbF9hbGxvY2F0aW9uAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAHZ29hbF9pZAAAAAAEAAAAAAAAAA5hbGxvY2F0aW9uX2JwcwAAAAAABAAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    quote: this.txFromJSON<Split>,
        route: this.txFromJSON<Split>,
        config: this.txFromJSON<Config>,
        add_goal: this.txFromJSON<u32>,
        get_rule: this.txFromJSON<Rule>,
        set_rule: this.txFromJSON<null>,
        get_goals: this.txFromJSON<Array<Goal>>,
        get_stats: this.txFromJSON<Stats>,
        initialize: this.txFromJSON<null>,
        quote_plan: this.txFromJSON<Array<GoalFill>>,
        update_goal: this.txFromJSON<null>,
        archive_goal: this.txFromJSON<null>,
        reorder_goals: this.txFromJSON<null>,
        set_goal_allocation: this.txFromJSON<null>
  }
}