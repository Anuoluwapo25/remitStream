// State-changing contract calls. Each builds an AssembledTransaction, signs it
// with the connected wallet, and submits it.
//
// Every action returns the transaction hash alongside its result. Pilot users
// repeatedly asked for a way to see a transfer on the block explorer — "when I
// sent money out I'm supposed to be seeing the transaction link" — and the hash
// is the only thing that makes that link possible, so it is part of every
// action's contract rather than an afterthought at one call site.

import { tokenClient, vaultClient, routerClient, type Signer } from "./contracts";
import type { Split } from "./reads";

/** A submitted transaction: the contract's return value, plus its ledger hash. */
export type Submitted<T> = {
  result: T;
  /**
   * Hash of the submitted transaction, for building an explorer link.
   * Null in the rare case the RPC accepts a transaction without echoing one
   * back — the action still succeeded, so callers degrade to no link.
   */
  txHash: string | null;
};

type Assembled<T> = {
  signAndSend: () => Promise<{
    result: T;
    sendTransactionResponse?: { hash?: string } | null;
  }>;
};

async function submit<T>(assembled: Assembled<T>): Promise<Submitted<T>> {
  const sent = await assembled.signAndSend();
  return { result: sent.result, txHash: sent.sendTransactionResponse?.hash ?? null };
}

/** Claim testnet rUSDC from the faucet. */
export async function claimFaucet(signer: Signer): Promise<Submitted<null>> {
  const tx = await tokenClient(signer).faucet({ to: signer.publicKey });
  return submit(tx);
}

/** Set the connected user's savings rule (basis points, 0–10000). */
export async function setRule(
  signer: Signer,
  saveBps: number,
): Promise<Submitted<null>> {
  const tx = await routerClient(signer).set_rule({
    recipient: signer.publicKey,
    save_bps: saveBps,
  });
  return submit(tx);
}

/** Send a remittance; the router splits it per the recipient's rule. */
export async function sendRemittance(
  signer: Signer,
  recipient: string,
  amount: bigint,
): Promise<Submitted<Split>> {
  const tx = await routerClient(signer).route({
    sender: signer.publicKey,
    recipient,
    amount,
  });
  const { result, txHash } = await submit<{ payout: bigint; saved: bigint }>(tx);
  return {
    result: { payout: BigInt(result.payout), saved: BigInt(result.saved) },
    txHash,
  };
}

/** Withdraw a specific amount of savings back to the wallet. */
export async function withdrawSavings(
  signer: Signer,
  amount: bigint,
): Promise<Submitted<null>> {
  const tx = await vaultClient(signer).withdraw({
    user: signer.publicKey,
    amount,
  });
  return submit(tx);
}

/** Withdraw the entire savings balance. */
export async function withdrawAllSavings(
  signer: Signer,
): Promise<Submitted<null>> {
  const tx = await vaultClient(signer).withdraw_all({ user: signer.publicKey });
  return submit(tx);
}
