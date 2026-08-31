// Typed client factories for the three RemitStream contracts.
//
// Read-only clients need no signer: simulation runs against the RPC. Clients
// that submit transactions are given the connected wallet's address and a
// `signTransaction` callback, so the same binding serves both cases.

import { Client as TokenClient } from "@/bindings/token";
import { Client as VaultClient } from "@/bindings/vault";
import { Client as RouterClient } from "@/bindings/router";
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

/** Known contract error messages, keyed by the numeric code the SDK surfaces. */
export const CONTRACT_ERRORS: Record<string, string> = {
  FaucetCooldown: "You've already claimed recently. Try again in a few hours.",
  InsufficientBalance: `Not enough ${config.assetCode} for this amount.`,
  InvalidAmount: "Enter an amount greater than zero.",
  InvalidSplit: "Savings rate must be between 0% and 100%.",
  SelfTransfer: "You can't send a remittance to yourself.",
  FundsNotReceived: "The transfer didn't complete. Please retry.",
  NotInitialized: "The contract isn't ready yet. Please retry shortly.",
};

/**
 * Turn a raw contract/SDK error into a human sentence. Falls back to a generic
 * message so users never see a raw XDR or panic string.
 */
export function humanizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  for (const [code, msg] of Object.entries(CONTRACT_ERRORS)) {
    if (raw.includes(code)) return msg;
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
