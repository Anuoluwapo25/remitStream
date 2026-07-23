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
    contractId: "CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidAmount"},
  4: {message:"InsufficientBalance"},
  /**
   * `credit` was called but the tokens never actually landed in the vault.
   */
  5: {message:"FundsNotReceived"},
  /**
   * Yield cannot be distributed when there are no shares to distribute it to.
   */
  6: {message:"NoDepositors"},
  7: {message:"RouterNotSet"}
}


export interface Config {
  admin: string;
  token: string;
}


export type DataKey = {tag: "Config", values: void} | {tag: "Router", values: void} | {tag: "TotalShares", values: void} | {tag: "TotalAssets", values: void} | {tag: "Shares", values: readonly [string]};




export interface Client {
  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a credit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credit a beneficiary for tokens the router has *already* transferred in.
   * 
   * Only the configured router may call this. The vault independently verifies the
   * tokens arrived by checking its own on-chain balance against accounted assets,
   * so a compromised router still cannot mint shares out of thin air.
   */
  credit: ({beneficiary, amount}: {beneficiary: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  router: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit directly into the vault, pulling `amount` from `from`.
   * `beneficiary` receives the shares, so a sender can fund someone else's savings.
   */
  deposit: ({from, beneficiary, amount}: {from: string, beneficiary: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw `amount` of underlying assets, burning the matching shares.
   */
  withdraw: ({user, amount}: {user: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a shares_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  shares_of: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a balance_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A user's balance in underlying assets, including accrued yield.
   */
  balance_of: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. `admin` may set the router and distribute yield.
   */
  initialize: ({admin, token}: {admin: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Authorize the AutoSplitRouter that may `credit` this vault.
   */
  set_router: ({router}: {router: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accrue_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Distribute yield to all shareholders by pulling `amount` from the admin.
   * Mints no shares, so every existing share becomes worth proportionally more.
   */
  accrue_yield: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a total_assets transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_assets: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a total_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_shares: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a withdraw_all transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw the caller's entire balance.
   */
  withdraw_all: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAABAAAAEZgY3JlZGl0YCB3YXMgY2FsbGVkIGJ1dCB0aGUgdG9rZW5zIG5ldmVyIGFjdHVhbGx5IGxhbmRlZCBpbiB0aGUgdmF1bHQuAAAAAAAQRnVuZHNOb3RSZWNlaXZlZAAAAAUAAABJWWllbGQgY2Fubm90IGJlIGRpc3RyaWJ1dGVkIHdoZW4gdGhlcmUgYXJlIG5vIHNoYXJlcyB0byBkaXN0cmlidXRlIGl0IHRvLgAAAAAAAAxOb0RlcG9zaXRvcnMAAAAGAAAAAAAAAAxSb3V0ZXJOb3RTZXQAAAAH",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJvdXRlciBjcmVkaXRzIHNhdmluZ3Mgc3BsaXQgb2ZmIGEgcmVtaXR0YW5jZS4AAAAAAAAAAAZDcmVkaXQAAAAAAAEAAAAGY3JlZGl0AAAAAAADAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAAAAAAI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAGUm91dGVyAAAAAAAAAAAAAAAAAAtUb3RhbFNoYXJlcwAAAAAAAAAAAAAAAAtUb3RhbEFzc2V0cwAAAAABAAAAAAAAAAZTaGFyZXMAAAAAAAEAAAAT",
        "AAAABQAAADVFbWl0dGVkIHdoZW4gYSB1c2VyIGRlcG9zaXRzIGRpcmVjdGx5IGludG8gdGhlIHZhdWx0LgAAAAAAAAAAAAAHRGVwb3NpdAAAAAABAAAAB2RlcG9zaXQAAAAAAwAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAABnNoYXJlcwAAAAAACwAAAAAAAAAC",
        "AAAABQAAADBFbWl0dGVkIHdoZW4gYSB1c2VyIHdpdGhkcmF3cyB1bmRlcmx5aW5nIGFzc2V0cy4AAAAAAAAACFdpdGhkcmF3AAAAAQAAAAh3aXRoZHJhdwAAAAMAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAAShDcmVkaXQgYSBiZW5lZmljaWFyeSBmb3IgdG9rZW5zIHRoZSByb3V0ZXIgaGFzICphbHJlYWR5KiB0cmFuc2ZlcnJlZCBpbi4KCk9ubHkgdGhlIGNvbmZpZ3VyZWQgcm91dGVyIG1heSBjYWxsIHRoaXMuIFRoZSB2YXVsdCBpbmRlcGVuZGVudGx5IHZlcmlmaWVzIHRoZQp0b2tlbnMgYXJyaXZlZCBieSBjaGVja2luZyBpdHMgb3duIG9uLWNoYWluIGJhbGFuY2UgYWdhaW5zdCBhY2NvdW50ZWQgYXNzZXRzLApzbyBhIGNvbXByb21pc2VkIHJvdXRlciBzdGlsbCBjYW5ub3QgbWludCBzaGFyZXMgb3V0IG9mIHRoaW4gYWlyLgAAAAZjcmVkaXQAAAAAAAIAAAAAAAAAC2JlbmVmaWNpYXJ5AAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAGcm91dGVyAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAABQAAADpFbWl0dGVkIHdoZW4geWllbGQgaXMgZGlzdHJpYnV0ZWQgYWNyb3NzIGFsbCBzaGFyZWhvbGRlcnMuAAAAAAAAAAAADFlpZWxkQWNjcnVlZAAAAAEAAAANeWllbGRfYWNjcnVlZAAAAAAAAAIAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAADHRvdGFsX2Fzc2V0cwAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAI5EZXBvc2l0IGRpcmVjdGx5IGludG8gdGhlIHZhdWx0LCBwdWxsaW5nIGBhbW91bnRgIGZyb20gYGZyb21gLgpgYmVuZWZpY2lhcnlgIHJlY2VpdmVzIHRoZSBzaGFyZXMsIHNvIGEgc2VuZGVyIGNhbiBmdW5kIHNvbWVvbmUgZWxzZSdzIHNhdmluZ3MuAAAAAAAHZGVwb3NpdAAAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAERXaXRoZHJhdyBgYW1vdW50YCBvZiB1bmRlcmx5aW5nIGFzc2V0cywgYnVybmluZyB0aGUgbWF0Y2hpbmcgc2hhcmVzLgAAAAh3aXRoZHJhdwAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAJc2hhcmVzX29mAAAAAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAACw==",
        "AAAAAAAAAD9BIHVzZXIncyBiYWxhbmNlIGluIHVuZGVybHlpbmcgYXNzZXRzLCBpbmNsdWRpbmcgYWNjcnVlZCB5aWVsZC4AAAAACmJhbGFuY2Vfb2YAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAAEBPbmUtdGltZSBzZXR1cC4gYGFkbWluYCBtYXkgc2V0IHRoZSByb3V0ZXIgYW5kIGRpc3RyaWJ1dGUgeWllbGQuAAAACmluaXRpYWxpemUAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==",
        "AAAAAAAAADtBdXRob3JpemUgdGhlIEF1dG9TcGxpdFJvdXRlciB0aGF0IG1heSBgY3JlZGl0YCB0aGlzIHZhdWx0LgAAAAAKc2V0X3JvdXRlcgAAAAAAAQAAAAAAAAAGcm91dGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAJREaXN0cmlidXRlIHlpZWxkIHRvIGFsbCBzaGFyZWhvbGRlcnMgYnkgcHVsbGluZyBgYW1vdW50YCBmcm9tIHRoZSBhZG1pbi4KTWludHMgbm8gc2hhcmVzLCBzbyBldmVyeSBleGlzdGluZyBzaGFyZSBiZWNvbWVzIHdvcnRoIHByb3BvcnRpb25hbGx5IG1vcmUuAAAADGFjY3J1ZV95aWVsZAAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAMdG90YWxfYXNzZXRzAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMdG90YWxfc2hhcmVzAAAAAAAAAAEAAAAL",
        "AAAAAAAAACVXaXRoZHJhdyB0aGUgY2FsbGVyJ3MgZW50aXJlIGJhbGFuY2UuAAAAAAAADHdpdGhkcmF3X2FsbAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    config: this.txFromJSON<Config>,
        credit: this.txFromJSON<null>,
        router: this.txFromJSON<Option<string>>,
        deposit: this.txFromJSON<null>,
        withdraw: this.txFromJSON<null>,
        shares_of: this.txFromJSON<i128>,
        balance_of: this.txFromJSON<i128>,
        initialize: this.txFromJSON<null>,
        set_router: this.txFromJSON<null>,
        accrue_yield: this.txFromJSON<null>,
        total_assets: this.txFromJSON<i128>,
        total_shares: this.txFromJSON<i128>,
        withdraw_all: this.txFromJSON<null>
  }
}