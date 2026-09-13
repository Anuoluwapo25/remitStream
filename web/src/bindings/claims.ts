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


// Not yet deployed to testnet — contracts.ts requires NEXT_PUBLIC_CLAIMS_ID to
// be set explicitly before this client is used, rather than defaulting here.
export const networks = {} as const

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * A single locked transfer, redeemable by whoever produces the secret whose
 * sha256 hash is `secret_hash`.
 */
export interface Claim {
  amount: i128;
  /**
 * Unix seconds after which the sender may reclaim. 0 means no deadline —
 * the claim never expires and can never be reclaimed.
 */
expires_at: u64;
  /**
 * A short message the recipient sees when they open the link.
 */
note: string;
  secret_hash: Buffer;
  sender: string;
  status: ClaimStatus;
}

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidAmount"},
  4: {message:"ClaimNotFound"},
  /**
   * The provided secret's hash doesn't match the one the claim was created with.
   */
  5: {message:"WrongSecret"},
  /**
   * The claim was already claimed or reclaimed.
   */
  6: {message:"AlreadyResolved"},
  /**
   * `claim` was called after the sender's chosen deadline passed.
   */
  7: {message:"Expired"},
  /**
   * `reclaim` was called before the deadline, or on a claim with none.
   */
  8: {message:"NotExpired"},
  /**
   * A note is longer than `MAX_NOTE_LEN`.
   */
  9: {message:"NoteTooLong"}
}


export interface Config {
  token: string;
}

export type DataKey = {tag: "Config", values: void} | {tag: "NextId", values: void} | {tag: "Claim", values: readonly [u64]};



/**
 * Lifecycle of a claim.
 */
export type ClaimStatus = {tag: "Pending", values: void} | {tag: "Claimed", values: void} | {tag: "Reclaimed", values: void};


export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Redeem a claim by proving knowledge of its secret. Sends the funds to
   * `to`. Deliberately requires no signature — see the module docs: the
   * secret itself is the authorization, so someone with no Stellar
   * account until this very transaction can still be the one who claims.
   */
  claim: ({claim_id, secret, to}: {claim_id: u64, secret: Buffer, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a reclaim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The sender takes back an unclaimed claim after its deadline passed.
   */
  reclaim: ({claim_id}: {claim_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Preview a claim before redeeming it — status, amount, note, deadline.
   * Safe to call with no wallet connected; reveals nothing about the
   * secret (only its hash was ever stored).
   */
  get_claim: ({claim_id}: {claim_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Claim>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock `amount` behind `secret_hash`, the sha256 hash of a secret only
   * the sender generates and shares out of band. Returns the claim id.
   * 
   * `expires_at` is a unix timestamp; pass 0 for a claim that never
   * expires (and so can never be reclaimed). `note` is shown to whoever
   * opens the claim, up to `MAX_NOTE_LEN` bytes — pass an empty string
   * for none.
   */
  create_claim: ({sender, amount, secret_hash, expires_at, note}: {sender: string, amount: i128, secret_hash: Buffer, expires_at: u64, note: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

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
      new ContractSpec([ "AAAAAQAAAGdBIHNpbmdsZSBsb2NrZWQgdHJhbnNmZXIsIHJlZGVlbWFibGUgYnkgd2hvZXZlciBwcm9kdWNlcyB0aGUgc2VjcmV0IHdob3NlCnNoYTI1NiBoYXNoIGlzIGBzZWNyZXRfaGFzaGAuAAAAAAAAAAAFQ2xhaW0AAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAB8VW5peCBzZWNvbmRzIGFmdGVyIHdoaWNoIHRoZSBzZW5kZXIgbWF5IHJlY2xhaW0uIDAgbWVhbnMgbm8gZGVhZGxpbmUg4oCUCnRoZSBjbGFpbSBuZXZlciBleHBpcmVzIGFuZCBjYW4gbmV2ZXIgYmUgcmVjbGFpbWVkLgAAAApleHBpcmVzX2F0AAAAAAAGAAAAO0Egc2hvcnQgbWVzc2FnZSB0aGUgcmVjaXBpZW50IHNlZXMgd2hlbiB0aGV5IG9wZW4gdGhlIGxpbmsuAAAAAARub3RlAAAAEAAAAAAAAAALc2VjcmV0X2hhc2gAAAAD7gAAACAAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAC0NsYWltU3RhdHVzAA==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAAAAAADUNsYWltTm90Rm91bmQAAAAAAAAEAAAATFRoZSBwcm92aWRlZCBzZWNyZXQncyBoYXNoIGRvZXNuJ3QgbWF0Y2ggdGhlIG9uZSB0aGUgY2xhaW0gd2FzIGNyZWF0ZWQgd2l0aC4AAAALV3JvbmdTZWNyZXQAAAAABQAAACtUaGUgY2xhaW0gd2FzIGFscmVhZHkgY2xhaW1lZCBvciByZWNsYWltZWQuAAAAAA9BbHJlYWR5UmVzb2x2ZWQAAAAABgAAAD1gY2xhaW1gIHdhcyBjYWxsZWQgYWZ0ZXIgdGhlIHNlbmRlcidzIGNob3NlbiBkZWFkbGluZSBwYXNzZWQuAAAAAAAAB0V4cGlyZWQAAAAABwAAAEJgcmVjbGFpbWAgd2FzIGNhbGxlZCBiZWZvcmUgdGhlIGRlYWRsaW5lLCBvciBvbiBhIGNsYWltIHdpdGggbm9uZS4AAAAAAApOb3RFeHBpcmVkAAAAAAAIAAAAJUEgbm90ZSBpcyBsb25nZXIgdGhhbiBgTUFYX05PVEVfTEVOYC4AAAAAAAALTm90ZVRvb0xvbmcAAAAACQ==",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAAT",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAAAAAAAAVDbGFpbQAAAAAAAAEAAAAG",
        "AAAAAAAAAQ9SZWRlZW0gYSBjbGFpbSBieSBwcm92aW5nIGtub3dsZWRnZSBvZiBpdHMgc2VjcmV0LiBTZW5kcyB0aGUgZnVuZHMgdG8KYHRvYC4gRGVsaWJlcmF0ZWx5IHJlcXVpcmVzIG5vIHNpZ25hdHVyZSDigJQgc2VlIHRoZSBtb2R1bGUgZG9jczogdGhlCnNlY3JldCBpdHNlbGYgaXMgdGhlIGF1dGhvcml6YXRpb24sIHNvIHNvbWVvbmUgd2l0aCBubyBTdGVsbGFyCmFjY291bnQgdW50aWwgdGhpcyB2ZXJ5IHRyYW5zYWN0aW9uIGNhbiBzdGlsbCBiZSB0aGUgb25lIHdobyBjbGFpbXMuAAAAAAVjbGFpbQAAAAAAAAMAAAAAAAAACGNsYWltX2lkAAAABgAAAAAAAAAGc2VjcmV0AAAAAAAOAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAABQAAAC5FbWl0dGVkIHdoZW4gYSBjbGFpbSBpcyBzdWNjZXNzZnVsbHkgcmVkZWVtZWQuAAAAAAAAAAAACFJlZGVlbWVkAAAAAQAAAAhyZWRlZW1lZAAAAAMAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAIY2xhaW1faWQAAAAGAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAENUaGUgc2VuZGVyIHRha2VzIGJhY2sgYW4gdW5jbGFpbWVkIGNsYWltIGFmdGVyIGl0cyBkZWFkbGluZSBwYXNzZWQuAAAAAAdyZWNsYWltAAAAAAEAAAAAAAAACGNsYWltX2lkAAAABgAAAAA=",
        "AAAABQAAAD1FbWl0dGVkIHdoZW4gYSBzZW5kZXIgdGFrZXMgYmFjayBhbiBleHBpcmVkLCB1bmNsYWltZWQgY2xhaW0uAAAAAAAAAAAAAAlSZWNsYWltZWQAAAAAAAABAAAACXJlY2xhaW1lZAAAAAAAAAMAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAEAAAAAAAAACGNsYWltX2lkAAAABgAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAAAgAAABVMaWZlY3ljbGUgb2YgYSBjbGFpbS4AAAAAAAAAAAAAC0NsYWltU3RhdHVzAAAAAAMAAAAAAAAAKUZ1bmRzIGFyZSBsb2NrZWQsIHdhaXRpbmcgZm9yIHRoZSBzZWNyZXQuAAAAAAAAB1BlbmRpbmcAAAAAAAAAABZTdWNjZXNzZnVsbHkgcmVkZWVtZWQuAAAAAAAHQ2xhaW1lZAAAAAAAAAAAJlRha2VuIGJhY2sgYnkgdGhlIHNlbmRlciBhZnRlciBleHBpcnkuAAAAAAAJUmVjbGFpbWVkAAAA",
        "AAAAAAAAALBQcmV2aWV3IGEgY2xhaW0gYmVmb3JlIHJlZGVlbWluZyBpdCDigJQgc3RhdHVzLCBhbW91bnQsIG5vdGUsIGRlYWRsaW5lLgpTYWZlIHRvIGNhbGwgd2l0aCBubyB3YWxsZXQgY29ubmVjdGVkOyByZXZlYWxzIG5vdGhpbmcgYWJvdXQgdGhlCnNlY3JldCAob25seSBpdHMgaGFzaCB3YXMgZXZlciBzdG9yZWQpLgAAAAlnZXRfY2xhaW0AAAAAAAABAAAAAAAAAAhjbGFpbV9pZAAAAAYAAAABAAAH0AAAAAVDbGFpbQAAAA==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==",
        "AAAABQAAAChFbWl0dGVkIHdoZW4gYSBzZW5kZXIgbG9ja3MgYSBuZXcgY2xhaW0uAAAAAAAAAAxDbGFpbUNyZWF0ZWQAAAABAAAADWNsYWltX2NyZWF0ZWQAAAAAAAAEAAAAAAAAAAZzZW5kZXIAAAAAABMAAAABAAAAAAAAAAhjbGFpbV9pZAAAAAYAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAI=",
        "AAAAAAAAAVtMb2NrIGBhbW91bnRgIGJlaGluZCBgc2VjcmV0X2hhc2hgLCB0aGUgc2hhMjU2IGhhc2ggb2YgYSBzZWNyZXQgb25seQp0aGUgc2VuZGVyIGdlbmVyYXRlcyBhbmQgc2hhcmVzIG91dCBvZiBiYW5kLiBSZXR1cm5zIHRoZSBjbGFpbSBpZC4KCmBleHBpcmVzX2F0YCBpcyBhIHVuaXggdGltZXN0YW1wOyBwYXNzIDAgZm9yIGEgY2xhaW0gdGhhdCBuZXZlcgpleHBpcmVzIChhbmQgc28gY2FuIG5ldmVyIGJlIHJlY2xhaW1lZCkuIGBub3RlYCBpcyBzaG93biB0byB3aG9ldmVyCm9wZW5zIHRoZSBjbGFpbSwgdXAgdG8gYE1BWF9OT1RFX0xFTmAgYnl0ZXMg4oCUIHBhc3MgYW4gZW1wdHkgc3RyaW5nCmZvciBub25lLgAAAAAMY3JlYXRlX2NsYWltAAAABQAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAC3NlY3JldF9oYXNoAAAAA+4AAAAgAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAARub3RlAAAAEAAAAAEAAAAG" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<i128>,
        config: this.txFromJSON<Config>,
        reclaim: this.txFromJSON<null>,
        get_claim: this.txFromJSON<Claim>,
        initialize: this.txFromJSON<null>,
        create_claim: this.txFromJSON<u64>
  }
}