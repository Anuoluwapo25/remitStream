// Typed client factories for the three RemitStream contracts.
//
// Read-only clients need no signer: simulation runs against the RPC. Clients
// that submit transactions are given the connected wallet's address and a
// `signTransaction` callback, so the same binding serves both cases.

import { Client as TokenClient, Errors as TokenErrors } from "@/bindings/token";
import { Client as VaultClient, Errors as VaultErrors } from "@/bindings/vault";
import { Client as RouterClient, Errors as RouterErrors } from "@/bindings/router";
import { Client as ClaimsClient, Errors as ClaimsErrors } from "@/bindings/claims";
import { config } from "./config";

export type Signer = {
  publicKey: string;
  signTransaction: (
    xdr: string,
    opts?: { networkPassphrase?: string },
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
};

function baseOptions(contractId: string, signer?: Signer) {
  return {
    contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    allowHttp: config.rpcUrl.startsWith("http://"),
    // For reads we still need a source account to build the simulation tx;
    // fall back to a public funded account when no wallet is connected.
    publicKey: signer?.publicKey ?? config.readAccount,
    // The binding calls this with the unsigned XDR; forward to the wallet.
    signTransaction: signer?.signTransaction,
  };
}

export function tokenClient(signer?: Signer): TokenClient {
  return new TokenClient(baseOptions(config.contracts.token, signer));
}

export function vaultClient(signer?: Signer): VaultClient {
  return new VaultClient(baseOptions(config.contracts.vault, signer));
}

export function routerClient(signer?: Signer): RouterClient {
  return new RouterClient(baseOptions(config.contracts.router, signer));
}

/** Throws if claim links aren't deployed on this environment yet — check
 * `config.claimLinksEnabled` before calling anything that needs this. */
export function claimsClient(signer?: Signer): ClaimsClient {
  if (!config.claimLinksEnabled) {
    throw new Error("Claim links aren't available on this deployment yet.");
  }
  return new ClaimsClient(baseOptions(config.contracts.claims, signer));
}

/**
 * Known contract error messages, keyed by the error's *name* (e.g.
 * "FaucetCooldown") rather than by contract, since a sentence like "not
 * enough balance" reads the same regardless of which contract said it.
 *
 * The wrinkle this exists to work around: a panic surfaces from the RPC as
 * `Error(Contract, #7)` — a bare number. The human name ("FaucetCooldown")
 * is never in that string; it only lives in each contract's own spec, which
 * is why the three `Errors` maps below (one per contract) are needed to
 * translate the number first. Verified against a live testnet call rather
 * than assumed — an early version of this function matched error *names*
 * directly against the raw message and never once fired, silently falling
 * through to the generic fallback for every contract error.
 */
const ERROR_SENTENCES: Record<string, string> = {
  // remit-token
  FaucetCooldown: "You've already claimed recently. Try again in a few hours.",
  InsufficientBalance: `Not enough ${config.assetCode} for this amount.`,
  InsufficientAllowance: "That spending allowance is too low.",
  InvalidExpiration: "That expiration has already passed.",
  // shared
  InvalidAmount: "Enter an amount greater than zero.",
  NotInitialized: "The contract isn't ready yet. Please retry shortly.",
  AlreadyInitialized: "This is already set up.",
  // auto-split-router
  InvalidSplit: "Savings allocations must be between 0% and 100%.",
  SelfTransfer: "You can't send a remittance to yourself.",
  GoalNotFound: "That goal doesn't exist anymore — it may have been archived.",
  TooManyGoals: "You've reached the limit of savings goals. Archive one to add another.",
  BadReorder: "That reordering didn't match your current goals. Please refresh and retry.",
  InvalidName: "Give the goal a name, up to 48 characters.",
  // savings-vault
  FundsNotReceived: "The transfer didn't complete. Please retry.",
  NoDepositors: "There's no one to distribute yield to yet.",
  RouterNotSet: "The vault isn't linked to a router yet.",
  YieldPoolNotSet: "No yield pool is configured yet.",
  YieldPoolFunded: "Move funds out of the current yield pool before switching to another.",
  // claim-link
  ClaimNotFound: "That claim link doesn't exist — check you copied the whole link.",
  WrongSecret: "That claim code doesn't match this link. Copy the whole link again.",
  AlreadyResolved: "This claim was already redeemed or taken back — it can't be used again.",
  Expired: "This claim link has expired.",
  NotExpired: "This claim hasn't expired yet, so it can't be taken back.",
  NoteTooLong: "That note is too long (140 characters max).",
};

const CONTRACT_ERROR_PATTERN = /Error\(Contract, #(\d+)\)/;

/** Which contract a call was against, so the right numeric table is used —
 * error code 7 means something different in each of these contracts. */
export type ContractName = "token" | "vault" | "router" | "claims";

const ERROR_TABLES: Record<ContractName, Record<number, { message: string }>> = {
  token: TokenErrors,
  vault: VaultErrors,
  router: RouterErrors,
  claims: ClaimsErrors,
};

/**
 * Turn a raw contract/SDK error into a human sentence. Falls back to a
 * generic message so users never see a raw XDR or panic string.
 *
 * Always pass `contract` when the call site knows which one it just called
 * (every call site in this app does). The same numeric code means different
 * things in different contracts — code 4 is `InsufficientBalance` in the
 * token and vault but `InvalidSplit` in the router — so guessing by trying
 * every table can pick the wrong sentence. That fallback only exists so a
 * future call site that forgets to pass `contract` gets *a* real sentence
 * instead of silently falling through to the generic one, the way this
 * whole function did until a live test caught it.
 */
export function humanizeError(err: unknown, contract?: ContractName): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  const match = CONTRACT_ERROR_PATTERN.exec(raw);
  if (match) {
    const code = Number(match[1]);
    const tables = contract ? [ERROR_TABLES[contract]] : Object.values(ERROR_TABLES);
    for (const table of tables) {
      const name = table[code]?.message;
      if (name && ERROR_SENTENCES[name]) return ERROR_SENTENCES[name];
    }
  }

  if (/insufficient.*fee|txInsufficientFee/i.test(raw))
    return "Network fee too low — please retry.";
  if (/friendbot/i.test(raw))
    return "Couldn't create your testnet account automatically. Fund it once at friendbot.stellar.org, then try again.";
  if (/account not found|AccountNotFound/i.test(raw))
    return `Your wallet has no testnet account yet — tap “Get test ${config.assetCode}” to create it and get funds.`;
  if (/User (declined|rejected)|denied|cancelled/i.test(raw))
    return "Request was cancelled in your wallet.";
  if (/timeout|deadline/i.test(raw))
    return "The network took too long to respond. Please retry.";
  return "Something went wrong. Please try again.";
}
