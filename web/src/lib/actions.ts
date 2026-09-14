// State-changing contract calls. Each builds an AssembledTransaction, signs it
// with the connected wallet, and submits it.
//
// Every action returns the transaction hash alongside its result. Pilot users
// repeatedly asked for a way to see a transfer on the block explorer — "when I
// sent money out I'm supposed to be seeing the transaction link" — and the hash
// is the only thing that makes that link possible, so it is part of every
// action's contract rather than an afterthought at one call site.

import { Buffer } from "buffer";
import {
  tokenClient,
  vaultClient,
  routerClient,
  claimsClient,
  circlesClient,
  type Signer,
} from "./contracts";
import { ensureAccountFunded } from "./friendbot";
import { generateSecret, claimLinkUrl } from "./claimLinks";
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

/**
 * Claim test tokens from the faucet built into the testnet token.
 *
 * The claim starts by making sure the wallet actually has an account on the
 * network. A never-used address doesn't, and the SDK can't so much as build the
 * faucet transaction without one — testers arrived at "Your account isn't
 * funded on testnet yet." on their very first tap, with no way forward inside
 * the app. `onStage` reports that extra step when it happens, so the UI can say
 * why a first claim takes a few seconds longer.
 */
export async function claimFaucet(
  signer: Signer,
  onStage?: (stage: "creating-account" | "claiming") => void,
): Promise<Submitted<null> & { accountCreated: boolean }> {
  const accountCreated = await ensureAccountFunded(signer.publicKey, () =>
    onStage?.("creating-account"),
  );
  if (accountCreated) onStage?.("claiming");
  const tx = await tokenClient(signer).faucet({ to: signer.publicKey });
  return { ...(await submit<null>(tx)), accountCreated };
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

/**
 * Create a savings goal. `target` is in base units (0n = open-ended),
 * `deadline` is unix seconds (0 = none), `allocationBps` is this goal's slice
 * of every inbound transfer. Returns the new goal's id.
 */
export async function addGoal(
  signer: Signer,
  goal: {
    name: string;
    target: bigint;
    deadline: number;
    allocationBps: number;
  },
): Promise<Submitted<number>> {
  const tx = await routerClient(signer).add_goal({
    owner: signer.publicKey,
    name: goal.name,
    target: goal.target,
    deadline: BigInt(goal.deadline),
    allocation_bps: goal.allocationBps,
  });
  const { result, txHash } = await submit<number | bigint>(tx);
  return { result: Number(result), txHash };
}

/** Replace a goal's editable fields. */
export async function updateGoal(
  signer: Signer,
  goalId: number,
  goal: {
    name: string;
    target: bigint;
    deadline: number;
    allocationBps: number;
  },
): Promise<Submitted<null>> {
  const tx = await routerClient(signer).update_goal({
    owner: signer.publicKey,
    goal_id: goalId,
    name: goal.name,
    target: goal.target,
    deadline: BigInt(goal.deadline),
    allocation_bps: goal.allocationBps,
  });
  return submit(tx);
}

/** Change only a goal's allocation — the slider path. */
export async function setGoalAllocation(
  signer: Signer,
  goalId: number,
  allocationBps: number,
): Promise<Submitted<null>> {
  const tx = await routerClient(signer).set_goal_allocation({
    owner: signer.publicKey,
    goal_id: goalId,
    allocation_bps: allocationBps,
  });
  return submit(tx);
}

/** Retire a goal. Principal already saved stays withdrawable in the vault. */
export async function archiveGoal(
  signer: Signer,
  goalId: number,
): Promise<Submitted<null>> {
  const tx = await routerClient(signer).archive_goal({
    owner: signer.publicKey,
    goal_id: goalId,
  });
  return submit(tx);
}

/** Set goal priority. `order` is the full list of goal ids, first fills first. */
export async function reorderGoals(
  signer: Signer,
  order: number[],
): Promise<Submitted<null>> {
  const tx = await routerClient(signer).reorder_goals({
    owner: signer.publicKey,
    order,
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

/**
 * Lock `amount` behind a fresh random secret and return a shareable link.
 * No recipient address needed — see contracts/claim-link. `expiresAt` is a
 * unix timestamp (seconds); omit or pass 0 for a link that never expires
 * (and so can never be taken back either).
 */
export async function createClaimLink(
  signer: Signer,
  params: { amount: bigint; note?: string; expiresAt?: number },
): Promise<Submitted<{ claimId: bigint; url: string }>> {
  const { secret, hash } = await generateSecret();
  const tx = await claimsClient(signer).create_claim({
    sender: signer.publicKey,
    amount: params.amount,
    secret_hash: hash,
    expires_at: BigInt(params.expiresAt ?? 0),
    note: params.note ?? "",
  });
  const { result, txHash } = await submit<bigint>(tx);
  const claimId = BigInt(result);
  return { result: { claimId, url: claimLinkUrl(claimId, secret) }, txHash };
}

/**
 * Redeem a claim link into `to`'s wallet. `secret` is whatever came out of
 * the link's URL fragment (see claimLinks.ts). `signer` only pays the network
 * fee and submits the transaction — the contract requires no authorization
 * from `to` at all; producing the right secret is the authorization.
 */
export async function redeemClaim(
  signer: Signer,
  claimId: bigint,
  secret: Uint8Array,
  to: string,
): Promise<Submitted<bigint>> {
  const tx = await claimsClient(signer).claim({
    claim_id: claimId,
    secret: Buffer.from(secret),
    to,
  });
  const { result, txHash } = await submit<bigint>(tx);
  return { result: BigInt(result), txHash };
}

/** Sender takes back an unclaimed claim after its deadline has passed. */
export async function reclaimClaimLink(
  signer: Signer,
  claimId: bigint,
): Promise<Submitted<null>> {
  const tx = await claimsClient(signer).reclaim({ claim_id: claimId });
  return submit(tx);
}

/**
 * Start a new rotating savings circle. The caller becomes its first member
 * and gets paid first once it fills. Returns the new circle's id — share it
 * with whoever you're forming the circle with; they join with `joinCircle`.
 */
export async function createCircle(
  signer: Signer,
  params: {
    token: string;
    name: string;
    contribution: bigint;
    roundSeconds: number;
    size: number;
  },
): Promise<Submitted<bigint>> {
  const tx = await circlesClient(signer).create_circle({
    creator: signer.publicKey,
    token: params.token,
    name: params.name,
    contribution: params.contribution,
    round_seconds: BigInt(params.roundSeconds),
    size: params.size,
  });
  const { result, txHash } = await submit<bigint>(tx);
  return { result: BigInt(result), txHash };
}

/** Join a forming circle. Filling the last slot starts round 0. */
export async function joinCircle(
  signer: Signer,
  circleId: bigint,
): Promise<Submitted<null>> {
  const tx = await circlesClient(signer).join_circle({
    member: signer.publicKey,
    circle_id: circleId,
  });
  return submit(tx);
}

/** Pay into the circle's current round. */
export async function contributeToCircle(
  signer: Signer,
  circleId: bigint,
): Promise<Submitted<null>> {
  const tx = await circlesClient(signer).contribute({
    member: signer.publicKey,
    circle_id: circleId,
  });
  return submit(tx);
}

/** Take back a contribution stuck in a round that's run past its length
 * with other members still unpaid. */
export async function reclaimStalledRound(
  signer: Signer,
  circleId: bigint,
): Promise<Submitted<null>> {
  const tx = await circlesClient(signer).reclaim_stalled_round({
    member: signer.publicKey,
    circle_id: circleId,
  });
  return submit(tx);
}
