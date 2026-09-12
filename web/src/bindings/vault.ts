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
    contractId: "CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y",
  }
} as const

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




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
  7: {message:"RouterNotSet"},
  /**
   * `invest` / `sync_yield` called before an admin configured a Blend pool.
   */
  8: {message:"YieldPoolNotSet"},
  /**
   * Refusing to point the vault at a different pool while it still has a
   * deployed position in the current one — swapping would strand funds.
   */
  9: {message:"YieldPoolFunded"}
}


export interface Config {
  admin: string;
  token: string;
}


export type DataKey = {tag: "Config", values: void} | {tag: "Router", values: void} | {tag: "TotalShares", values: void} | {tag: "TotalAssets", values: void} | {tag: "Shares", values: readonly [string]} | {tag: "YieldPool", values: void} | {tag: "BlendBaseline", values: void};




export interface BlendRequest {
  address: string;
  amount: i128;
  request_type: u32;
}


export interface BlendReserve {
  asset: string;
  config: BlendReserveConfig;
  data: BlendReserveData;
  scalar: i128;
}



export interface BlendPositions {
  collateral: Map<u32, i128>;
  liabilities: Map<u32, i128>;
  supply: Map<u32, i128>;
}


export interface BlendReserveData {
  b_rate: i128;
  b_supply: i128;
  backstop_credit: i128;
  d_rate: i128;
  d_supply: i128;
  ir_mod: i128;
  last_time: u64;
}


export interface BlendReserveConfig {
  c_factor: u32;
  decimals: u32;
  enabled: boolean;
  index: u32;
  l_factor: u32;
  max_util: u32;
  r_base: u32;
  r_one: u32;
  r_three: u32;
  r_two: u32;
  reactivity: u32;
  supply_cap: i128;
  util: u32;
}

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
   * Construct and simulate a invest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Move `amount` of the vault's idle local balance into the configured
   * Blend pool as a plain (non-collateralized) supply — the vault only
   * ever lends what recipients saved, never borrows against it. Admin-only
   * and capped at the vault's real local balance, so it can't overdraw.
   */
  invest: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
   * Construct and simulate a sync_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reconcile accounted assets with what the vault's Blend position is
   * really worth right now, crediting the gap as yield (no shares minted,
   * same as `accrue_yield`) so every share gains pro rata. Permissionless
   * — it only ever raises `total_assets` to match value that Blend's own
   * reserve data proves the vault holds, so anyone can "poke" it. A no-op
   * before there are depositors, so an early poke can't orphan value with
   * no shareholder to receive it.
   */
  sync_yield: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a yield_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The Blend pool the vault is configured to invest in, if any.
   */
  yield_pool: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

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

  /**
   * Construct and simulate a blend_baseline transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Underlying-equivalent value the vault expects from Blend based on
   * principal flows alone — see `DataKey::BlendBaseline`.
   */
  blend_baseline: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a set_yield_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Point the vault at a Blend lending pool for real, protocol-generated
   * yield. Refuses to replace a pool that still has a deployed position —
   * `invest` everything back out (or let `withdraw` drain it) first, so a
   * pool swap can never strand funds.
   */
  set_yield_pool: ({pool}: {pool: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAABAAAAEZgY3JlZGl0YCB3YXMgY2FsbGVkIGJ1dCB0aGUgdG9rZW5zIG5ldmVyIGFjdHVhbGx5IGxhbmRlZCBpbiB0aGUgdmF1bHQuAAAAAAAQRnVuZHNOb3RSZWNlaXZlZAAAAAUAAABJWWllbGQgY2Fubm90IGJlIGRpc3RyaWJ1dGVkIHdoZW4gdGhlcmUgYXJlIG5vIHNoYXJlcyB0byBkaXN0cmlidXRlIGl0IHRvLgAAAAAAAAxOb0RlcG9zaXRvcnMAAAAGAAAAAAAAAAxSb3V0ZXJOb3RTZXQAAAAHAAAAR2BpbnZlc3RgIC8gYHN5bmNfeWllbGRgIGNhbGxlZCBiZWZvcmUgYW4gYWRtaW4gY29uZmlndXJlZCBhIEJsZW5kIHBvb2wuAAAAAA9ZaWVsZFBvb2xOb3RTZXQAAAAACAAAAIpSZWZ1c2luZyB0byBwb2ludCB0aGUgdmF1bHQgYXQgYSBkaWZmZXJlbnQgcG9vbCB3aGlsZSBpdCBzdGlsbCBoYXMgYQpkZXBsb3llZCBwb3NpdGlvbiBpbiB0aGUgY3VycmVudCBvbmUg4oCUIHN3YXBwaW5nIHdvdWxkIHN0cmFuZCBmdW5kcy4AAAAAAA9ZaWVsZFBvb2xGdW5kZWQAAAAACQ==",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJvdXRlciBjcmVkaXRzIHNhdmluZ3Mgc3BsaXQgb2ZmIGEgcmVtaXR0YW5jZS4AAAAAAAAAAAZDcmVkaXQAAAAAAAEAAAAGY3JlZGl0AAAAAAADAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAAAAAAI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAGUm91dGVyAAAAAAAAAAAAAAAAAAtUb3RhbFNoYXJlcwAAAAAAAAAAAAAAAAtUb3RhbEFzc2V0cwAAAAABAAAAAAAAAAZTaGFyZXMAAAAAAAEAAAATAAAAAAAAAJtUaGUgQmxlbmQgcG9vbCB0aGUgdmF1bHQgcGFya3MgaWRsZSBzYXZpbmdzIGluLiBVbnNldCBtZWFucyB0aGUgdmF1bHQKYmVoYXZlcyBleGFjdGx5IGFzIGl0IGFsd2F5cyBoYXMg4oCUIGxvY2FsIGJhbGFuY2Ugb25seSwgYWRtaW4tcHVzaGVkCmBhY2NydWVfeWllbGRgLgAAAAAJWWllbGRQb29sAAAAAAAAAAAAAQNVbmRlcmx5aW5nLWVxdWl2YWxlbnQgdmFsdWUgdGhlIHZhdWx0IGV4cGVjdHMgdG8gaG9sZCBpbiB0aGUgeWllbGQKcG9vbCBmcm9tIHByaW5jaXBhbCBmbG93cyAoYGludmVzdGAgLyB3aXRoZHJhdyB0b3AtdXBzKSBhbG9uZS4gVGhlIGdhcApiZXR3ZWVuIHRoaXMgYW5kIHRoZSBwb29sJ3MgcmVhbCBjdXJyZW50IHZhbHVlIGlzIGludGVyZXN0IOKAlCB0aGF0IGdhcAppcyB3aGF0IGBzeW5jX3lpZWxkYCB0dXJucyBpbnRvIGFjY291bnRlZCBhc3NldHMuAAAAAA1CbGVuZEJhc2VsaW5lAAAA",
        "AAAABQAAADVFbWl0dGVkIHdoZW4gYSB1c2VyIGRlcG9zaXRzIGRpcmVjdGx5IGludG8gdGhlIHZhdWx0LgAAAAAAAAAAAAAHRGVwb3NpdAAAAAABAAAAB2RlcG9zaXQAAAAAAwAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAABnNoYXJlcwAAAAAACwAAAAAAAAAC",
        "AAAABQAAADBFbWl0dGVkIHdoZW4gYSB1c2VyIHdpdGhkcmF3cyB1bmRlcmx5aW5nIGFzc2V0cy4AAAAAAAAACFdpdGhkcmF3AAAAAQAAAAh3aXRoZHJhdwAAAAMAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAAAAAAI=",
        "AAAAAQAAAAAAAAAAAAAADEJsZW5kUmVxdWVzdAAAAAMAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAxyZXF1ZXN0X3R5cGUAAAAE",
        "AAAAAQAAAAAAAAAAAAAADEJsZW5kUmVzZXJ2ZQAAAAQAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAGY29uZmlnAAAAAAfQAAAAEkJsZW5kUmVzZXJ2ZUNvbmZpZwAAAAAAAAAAAARkYXRhAAAH0AAAABBCbGVuZFJlc2VydmVEYXRhAAAAAAAAAAZzY2FsYXIAAAAAAAs=",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAAShDcmVkaXQgYSBiZW5lZmljaWFyeSBmb3IgdG9rZW5zIHRoZSByb3V0ZXIgaGFzICphbHJlYWR5KiB0cmFuc2ZlcnJlZCBpbi4KCk9ubHkgdGhlIGNvbmZpZ3VyZWQgcm91dGVyIG1heSBjYWxsIHRoaXMuIFRoZSB2YXVsdCBpbmRlcGVuZGVudGx5IHZlcmlmaWVzIHRoZQp0b2tlbnMgYXJyaXZlZCBieSBjaGVja2luZyBpdHMgb3duIG9uLWNoYWluIGJhbGFuY2UgYWdhaW5zdCBhY2NvdW50ZWQgYXNzZXRzLApzbyBhIGNvbXByb21pc2VkIHJvdXRlciBzdGlsbCBjYW5ub3QgbWludCBzaGFyZXMgb3V0IG9mIHRoaW4gYWlyLgAAAAZjcmVkaXQAAAAAAAIAAAAAAAAAC2JlbmVmaWNpYXJ5AAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAARNNb3ZlIGBhbW91bnRgIG9mIHRoZSB2YXVsdCdzIGlkbGUgbG9jYWwgYmFsYW5jZSBpbnRvIHRoZSBjb25maWd1cmVkCkJsZW5kIHBvb2wgYXMgYSBwbGFpbiAobm9uLWNvbGxhdGVyYWxpemVkKSBzdXBwbHkg4oCUIHRoZSB2YXVsdCBvbmx5CmV2ZXIgbGVuZHMgd2hhdCByZWNpcGllbnRzIHNhdmVkLCBuZXZlciBib3Jyb3dzIGFnYWluc3QgaXQuIEFkbWluLW9ubHkKYW5kIGNhcHBlZCBhdCB0aGUgdmF1bHQncyByZWFsIGxvY2FsIGJhbGFuY2UsIHNvIGl0IGNhbid0IG92ZXJkcmF3LgAAAAAGaW52ZXN0AAAAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAGcm91dGVyAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAABQAAADpFbWl0dGVkIHdoZW4geWllbGQgaXMgZGlzdHJpYnV0ZWQgYWNyb3NzIGFsbCBzaGFyZWhvbGRlcnMuAAAAAAAAAAAADFlpZWxkQWNjcnVlZAAAAAEAAAANeWllbGRfYWNjcnVlZAAAAAAAAAIAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAADHRvdGFsX2Fzc2V0cwAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAI5EZXBvc2l0IGRpcmVjdGx5IGludG8gdGhlIHZhdWx0LCBwdWxsaW5nIGBhbW91bnRgIGZyb20gYGZyb21gLgpgYmVuZWZpY2lhcnlgIHJlY2VpdmVzIHRoZSBzaGFyZXMsIHNvIGEgc2VuZGVyIGNhbiBmdW5kIHNvbWVvbmUgZWxzZSdzIHNhdmluZ3MuAAAAAAAHZGVwb3NpdAAAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAQAAAAAAAAAAAAAADkJsZW5kUG9zaXRpb25zAAAAAAADAAAAAAAAAApjb2xsYXRlcmFsAAAAAAPsAAAABAAAAAsAAAAAAAAAC2xpYWJpbGl0aWVzAAAAA+wAAAAEAAAACwAAAAAAAAAGc3VwcGx5AAAAAAPsAAAABAAAAAs=",
        "AAAAAAAAAERXaXRoZHJhdyBgYW1vdW50YCBvZiB1bmRlcmx5aW5nIGFzc2V0cywgYnVybmluZyB0aGUgbWF0Y2hpbmcgc2hhcmVzLgAAAAh3aXRoZHJhdwAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAJc2hhcmVzX29mAAAAAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAACw==",
        "AAAAAQAAAAAAAAAAAAAAEEJsZW5kUmVzZXJ2ZURhdGEAAAAHAAAAAAAAAAZiX3JhdGUAAAAAAAsAAAAAAAAACGJfc3VwcGx5AAAACwAAAAAAAAAPYmFja3N0b3BfY3JlZGl0AAAAAAsAAAAAAAAABmRfcmF0ZQAAAAAACwAAAAAAAAAIZF9zdXBwbHkAAAALAAAAAAAAAAZpcl9tb2QAAAAAAAsAAAAAAAAACWxhc3RfdGltZQAAAAAAAAY=",
        "AAAAAAAAAD9BIHVzZXIncyBiYWxhbmNlIGluIHVuZGVybHlpbmcgYXNzZXRzLCBpbmNsdWRpbmcgYWNjcnVlZCB5aWVsZC4AAAAACmJhbGFuY2Vfb2YAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAAEBPbmUtdGltZSBzZXR1cC4gYGFkbWluYCBtYXkgc2V0IHRoZSByb3V0ZXIgYW5kIGRpc3RyaWJ1dGUgeWllbGQuAAAACmluaXRpYWxpemUAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==",
        "AAAAAAAAADtBdXRob3JpemUgdGhlIEF1dG9TcGxpdFJvdXRlciB0aGF0IG1heSBgY3JlZGl0YCB0aGlzIHZhdWx0LgAAAAAKc2V0X3JvdXRlcgAAAAAAAQAAAAAAAAAGcm91dGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAb9SZWNvbmNpbGUgYWNjb3VudGVkIGFzc2V0cyB3aXRoIHdoYXQgdGhlIHZhdWx0J3MgQmxlbmQgcG9zaXRpb24gaXMKcmVhbGx5IHdvcnRoIHJpZ2h0IG5vdywgY3JlZGl0aW5nIHRoZSBnYXAgYXMgeWllbGQgKG5vIHNoYXJlcyBtaW50ZWQsCnNhbWUgYXMgYGFjY3J1ZV95aWVsZGApIHNvIGV2ZXJ5IHNoYXJlIGdhaW5zIHBybyByYXRhLiBQZXJtaXNzaW9ubGVzcwrigJQgaXQgb25seSBldmVyIHJhaXNlcyBgdG90YWxfYXNzZXRzYCB0byBtYXRjaCB2YWx1ZSB0aGF0IEJsZW5kJ3Mgb3duCnJlc2VydmUgZGF0YSBwcm92ZXMgdGhlIHZhdWx0IGhvbGRzLCBzbyBhbnlvbmUgY2FuICJwb2tlIiBpdC4gQSBuby1vcApiZWZvcmUgdGhlcmUgYXJlIGRlcG9zaXRvcnMsIHNvIGFuIGVhcmx5IHBva2UgY2FuJ3Qgb3JwaGFuIHZhbHVlIHdpdGgKbm8gc2hhcmVob2xkZXIgdG8gcmVjZWl2ZSBpdC4AAAAACnN5bmNfeWllbGQAAAAAAAAAAAABAAAACw==",
        "AAAAAAAAADxUaGUgQmxlbmQgcG9vbCB0aGUgdmF1bHQgaXMgY29uZmlndXJlZCB0byBpbnZlc3QgaW4sIGlmIGFueS4AAAAKeWllbGRfcG9vbAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAAEkJsZW5kUmVzZXJ2ZUNvbmZpZwAAAAAADQAAAAAAAAAIY19mYWN0b3IAAAAEAAAAAAAAAAhkZWNpbWFscwAAAAQAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAhsX2ZhY3RvcgAAAAQAAAAAAAAACG1heF91dGlsAAAABAAAAAAAAAAGcl9iYXNlAAAAAAAEAAAAAAAAAAVyX29uZQAAAAAAAAQAAAAAAAAAB3JfdGhyZWUAAAAABAAAAAAAAAAFcl90d28AAAAAAAAEAAAAAAAAAApyZWFjdGl2aXR5AAAAAAAEAAAAAAAAAApzdXBwbHlfY2FwAAAAAAALAAAAAAAAAAR1dGlsAAAABA==",
        "AAAAAAAAAJREaXN0cmlidXRlIHlpZWxkIHRvIGFsbCBzaGFyZWhvbGRlcnMgYnkgcHVsbGluZyBgYW1vdW50YCBmcm9tIHRoZSBhZG1pbi4KTWludHMgbm8gc2hhcmVzLCBzbyBldmVyeSBleGlzdGluZyBzaGFyZSBiZWNvbWVzIHdvcnRoIHByb3BvcnRpb25hbGx5IG1vcmUuAAAADGFjY3J1ZV95aWVsZAAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAMdG90YWxfYXNzZXRzAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMdG90YWxfc2hhcmVzAAAAAAAAAAEAAAAL",
        "AAAAAAAAACVXaXRoZHJhdyB0aGUgY2FsbGVyJ3MgZW50aXJlIGJhbGFuY2UuAAAAAAAADHdpdGhkcmF3X2FsbAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAA==",
        "AAAAAAAAAHlVbmRlcmx5aW5nLWVxdWl2YWxlbnQgdmFsdWUgdGhlIHZhdWx0IGV4cGVjdHMgZnJvbSBCbGVuZCBiYXNlZCBvbgpwcmluY2lwYWwgZmxvd3MgYWxvbmUg4oCUIHNlZSBgRGF0YUtleTo6QmxlbmRCYXNlbGluZWAuAAAAAAAADmJsZW5kX2Jhc2VsaW5lAAAAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAPRQb2ludCB0aGUgdmF1bHQgYXQgYSBCbGVuZCBsZW5kaW5nIHBvb2wgZm9yIHJlYWwsIHByb3RvY29sLWdlbmVyYXRlZAp5aWVsZC4gUmVmdXNlcyB0byByZXBsYWNlIGEgcG9vbCB0aGF0IHN0aWxsIGhhcyBhIGRlcGxveWVkIHBvc2l0aW9uIOKAlApgaW52ZXN0YCBldmVyeXRoaW5nIGJhY2sgb3V0IChvciBsZXQgYHdpdGhkcmF3YCBkcmFpbiBpdCkgZmlyc3QsIHNvIGEKcG9vbCBzd2FwIGNhbiBuZXZlciBzdHJhbmQgZnVuZHMuAAAADnNldF95aWVsZF9wb29sAAAAAAABAAAAAAAAAARwb29sAAAAEwAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    config: this.txFromJSON<Config>,
        credit: this.txFromJSON<null>,
        invest: this.txFromJSON<null>,
        router: this.txFromJSON<Option<string>>,
        deposit: this.txFromJSON<null>,
        withdraw: this.txFromJSON<null>,
        shares_of: this.txFromJSON<i128>,
        balance_of: this.txFromJSON<i128>,
        initialize: this.txFromJSON<null>,
        set_router: this.txFromJSON<null>,
        sync_yield: this.txFromJSON<i128>,
        yield_pool: this.txFromJSON<Option<string>>,
        accrue_yield: this.txFromJSON<null>,
        total_assets: this.txFromJSON<i128>,
        total_shares: this.txFromJSON<i128>,
        withdraw_all: this.txFromJSON<null>,
        blend_baseline: this.txFromJSON<i128>,
        set_yield_pool: this.txFromJSON<null>
  }
}