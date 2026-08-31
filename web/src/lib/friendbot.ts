// Creating the Stellar account behind a brand-new wallet.
//
// On testnet an address is just a keypair until some transaction creates an
// account for it, and until that happens nothing else can happen: the RPC
// answers "Account not found" when the SDK tries to build a transaction, so
// even claiming from the token's own faucet fails. The tester guide told people
// their wallet would offer friendbot funding, but wallets only sometimes do —
// a tester who connected a fresh Freighter account hit "Your account isn't
// funded on testnet yet." with nothing in the UI able to fix it.
//
// So the app creates the account itself, which is safe because friendbot is a
// testnet-only faucet handing out test XLM.

import { config } from "./config";

// How long to wait for a friendbot-created account to show up on Horizon.
// Measured against testnet this lands around 12s, so the budget is generous —
// giving up early would strand the user on the error this whole path removes.
const POLL_INTERVAL_MS = 1000;
const POLL_ATTEMPTS = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Whether this address already has an account on the network. */
export async function accountExists(address: string): Promise<boolean> {
  const res = await fetch(`${config.horizonUrl}/accounts/${address}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  return true;
}

/**
 * Make sure `address` has an account, creating it with friendbot if not.
 *
 * Returns true when it created one, so callers can tell the user what happened,
 * and calls `onCreating` first when the slow path is about to run. A no-op on
 * networks without a faucet (`friendbotUrl` empty) — there the account has to
 * arrive with real funds, and the caller's own error handling explains that.
 */
export async function ensureAccountFunded(
  address: string,
  onCreating?: () => void,
): Promise<boolean> {
  if (!config.friendbotUrl) return false;
  if (await accountExists(address)) return false;
  onCreating?.();

  const res = await fetch(
    `${config.friendbotUrl}/?addr=${encodeURIComponent(address)}`,
  );
  // Friendbot answers 400 for an account it has already funded, which happens
  // when two tabs race. The account existing is what matters, not the status.
  if (!res.ok && !(await accountExists(address))) {
    throw new Error(`Friendbot ${res.status}`);
  }

  // Friendbot returns as soon as its transaction is submitted; Horizon can take
  // a ledger to catch up, and submitting before then fails the same way again.
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    if (await accountExists(address)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Friendbot funded the account but it hasn't appeared yet");
}
