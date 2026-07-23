// State-changing contract calls. Each builds an AssembledTransaction, signs it
// with the connected wallet, and submits it. Returns the parsed contract result.

import { tokenClient, vaultClient, routerClient, type Signer } from "./contracts";
import type { Split } from "./reads";

async function submit<T>(assembled: {
  signAndSend: () => Promise<{ result: T }>;
}): Promise<T> {
  const sent = await assembled.signAndSend();
  return sent.result;
}

/** Claim testnet rUSDC from the faucet. */
export async function claimFaucet(signer: Signer): Promise<void> {
  const tx = await tokenClient(signer).faucet({ to: signer.publicKey });
  await submit(tx);
}

/** Set the connected user's savings rule (basis points, 0–10000). */
export async function setRule(signer: Signer, saveBps: number): Promise<void> {
  const tx = await routerClient(signer).set_rule({
    recipient: signer.publicKey,
    save_bps: saveBps,
  });
  await submit(tx);
}

/** Send a remittance; the router splits it per the recipient's rule. */
export async function sendRemittance(
  signer: Signer,
  recipient: string,
  amount: bigint,
): Promise<Split> {
  const tx = await routerClient(signer).route({
    sender: signer.publicKey,
    recipient,
    amount,
  });
  const result = await submit<{ payout: bigint; saved: bigint }>(tx);
  return { payout: BigInt(result.payout), saved: BigInt(result.saved) };
}

/** Withdraw a specific amount of savings back to the wallet. */
export async function withdrawSavings(
  signer: Signer,
  amount: bigint,
): Promise<void> {
  const tx = await vaultClient(signer).withdraw({
    user: signer.publicKey,
    amount,
  });
  await submit(tx);
}

/** Withdraw the entire savings balance. */
export async function withdrawAllSavings(signer: Signer): Promise<void> {
  const tx = await vaultClient(signer).withdraw_all({ user: signer.publicKey });
  await submit(tx);
}
