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

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L",
  }
} as const


/**
 * A recipient's savings rule. Defaults to 0% saved until they opt in.
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
   * save_bps must be between 0 and 10_000 inclusive.
   */
  4: {message:"InvalidSplit"},
  /**
   * Sender and recipient must differ.
   */
  5: {message:"SelfTransfer"}
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


export type DataKey = {tag: "Config", values: void} | {tag: "Rule", values: readonly [string]} | {tag: "Stats", values: readonly [string]};


export interface Client {
  /**
   * Construct and simulate a quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Preview a split without moving funds — used by the UI before confirmation.
   */
  quote: ({recipient, amount}: {recipient: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Split>>

  /**
   * Construct and simulate a route transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Send `amount` to `recipient`, splitting it per the recipient's rule.
   * 
   * The router pulls the full amount, forwards the spendable part to the recipient,
   * and pushes the saved part into the vault before crediting the recipient's shares.
   */
  route: ({sender, recipient, amount}: {sender: string, recipient: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Split>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a get_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_rule: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Rule>>

  /**
   * Construct and simulate a set_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the caller's own savings rule. `save_bps` is in basis points (2_000 == 20%).
   */
  set_rule: ({recipient, save_bps}: {recipient: string, save_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_stats: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Stats>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, vault, token}: {admin: string, vault: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAQAAAENBIHJlY2lwaWVudCdzIHNhdmluZ3MgcnVsZS4gRGVmYXVsdHMgdG8gMCUgc2F2ZWQgdW50aWwgdGhleSBvcHQgaW4uAAAAAAAAAAAEUnVsZQAAAAIAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAIc2F2ZV9icHMAAAAE",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAwc2F2ZV9icHMgbXVzdCBiZSBiZXR3ZWVuIDAgYW5kIDEwXzAwMCBpbmNsdXNpdmUuAAAADEludmFsaWRTcGxpdAAAAAQAAAAhU2VuZGVyIGFuZCByZWNpcGllbnQgbXVzdCBkaWZmZXIuAAAAAAAADFNlbGZUcmFuc2ZlcgAAAAU=",
        "AAAAAQAAAEtSZXN1bHQgb2YgYSBzcGxpdCwgcmV0dXJuZWQgdG8gdGhlIGNhbGxlciBzbyB0aGUgVUkgY2FuIHNob3cgdGhlIGJyZWFrZG93bi4AAAAAAAAAAAVTcGxpdAAAAAAAAAIAAAAAAAAABnBheW91dAAAAAAACwAAAAAAAAAFc2F2ZWQAAAAAAAAL",
        "AAAAAQAAADVMaWZldGltZSB0b3RhbHMgcGVyIHJlY2lwaWVudCwgdXNlZCBieSB0aGUgZGFzaGJvYXJkLgAAAAAAAAAAAAAFU3RhdHMAAAAAAAADAAAAAAAAAA50b3RhbF9yZWNlaXZlZAAAAAAACwAAAAAAAAALdG90YWxfc2F2ZWQAAAAACwAAAAAAAAAJdHJhbnNmZXJzAAAAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABXZhdWx0AAAAAAAAEw==",
        "AAAABQAAAHtFbWl0dGVkIGZvciBldmVyeSByb3V0ZWQgcmVtaXR0YW5jZS4gSW5kZXhlZCBieSBib3RoIHBhcnRpZXMgc28gdGhlIGRhc2hib2FyZApjYW4gcXVlcnkgYSB1c2VyJ3Mgc2VudCBhbmQgcmVjZWl2ZWQgaGlzdG9yeS4AAAAAAAAAAAZSb3V0ZWQAAAAAAAEAAAAGcm91dGVkAAAAAAAFAAAAAAAAAAZzZW5kZXIAAAAAABMAAAABAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAGcGF5b3V0AAAAAAALAAAAAAAAAAAAAAAFc2F2ZWQAAAAAAAALAAAAAAAAAAI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAQAAAAAAAAAEUnVsZQAAAAEAAAATAAAAAQAAAAAAAAAFU3RhdHMAAAAAAAABAAAAEw==",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gYSByZWNpcGllbnQgY2hhbmdlcyB0aGVpciBzYXZpbmdzIHJ1bGUuAAAAAAAAAAdSdWxlU2V0AAAAAAEAAAAIcnVsZV9zZXQAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAAAAAAAAIc2F2ZV9icHMAAAAEAAAAAAAAAAI=",
        "AAAAAAAAAExQcmV2aWV3IGEgc3BsaXQgd2l0aG91dCBtb3ZpbmcgZnVuZHMg4oCUIHVzZWQgYnkgdGhlIFVJIGJlZm9yZSBjb25maXJtYXRpb24uAAAABXF1b3RlAAAAAAAAAgAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAB9AAAAAFU3BsaXQAAAA=",
        "AAAAAAAAAOdTZW5kIGBhbW91bnRgIHRvIGByZWNpcGllbnRgLCBzcGxpdHRpbmcgaXQgcGVyIHRoZSByZWNpcGllbnQncyBydWxlLgoKVGhlIHJvdXRlciBwdWxscyB0aGUgZnVsbCBhbW91bnQsIGZvcndhcmRzIHRoZSBzcGVuZGFibGUgcGFydCB0byB0aGUgcmVjaXBpZW50LAphbmQgcHVzaGVzIHRoZSBzYXZlZCBwYXJ0IGludG8gdGhlIHZhdWx0IGJlZm9yZSBjcmVkaXRpbmcgdGhlIHJlY2lwaWVudCdzIHNoYXJlcy4AAAAABXJvdXRlAAAAAAAAAwAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAH0AAAAAVTcGxpdAAAAA==",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAAAAAAAAIZ2V0X3J1bGUAAAABAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAB9AAAAAEUnVsZQ==",
        "AAAAAAAAAFBTZXQgdGhlIGNhbGxlcidzIG93biBzYXZpbmdzIHJ1bGUuIGBzYXZlX2Jwc2AgaXMgaW4gYmFzaXMgcG9pbnRzICgyXzAwMCA9PSAyMCUpLgAAAAhzZXRfcnVsZQAAAAIAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACHNhdmVfYnBzAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAJZ2V0X3N0YXRzAAAAAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAEAAAfQAAAABVN0YXRzAAAA",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    quote: this.txFromJSON<Split>,
        route: this.txFromJSON<Split>,
        config: this.txFromJSON<Config>,
        get_rule: this.txFromJSON<Rule>,
        set_rule: this.txFromJSON<null>,
        get_stats: this.txFromJSON<Stats>,
        initialize: this.txFromJSON<null>
  }
}