// Read-only, on-chain views. Each runs a simulation via the RPC and returns the
// parsed result. No wallet or signature required.

import { tokenClient, vaultClient, routerClient, claimsClient, circlesClient } from "./contracts";
import { logError } from "./analytics";

export type GoalStatus = "Active" | "Reached" | "Archived";

export type Goal = {
  id: number;
  name: string;
  /** Target in base units. 0n means open-ended (no cap). */
  target: bigint;
  /** Principal routed in so far, excluding vault yield. */
  saved: bigint;
  /** Unix seconds. 0 means no deadline. */
  deadline: number;
  allocationBps: number;
  status: GoalStatus;
};

/** One goal's slice of a previewed transfer. */
export type GoalFill = {
  goalId: number;
  name: string;
  amount: bigint;
  reachesTarget: boolean;
};

export type AccountData = {
  walletBalance: bigint;
  savings: bigint;
  rule: { enabled: boolean; save_bps: number };
  goals: Goal[];
  stats: { total_received: bigint; total_saved: bigint; transfers: number };
};

export type VaultTotals = {
  totalAssets: bigint;
  totalShares: bigint;
};

export type Split = { payout: bigint; saved: bigint };

export async function getWalletBalance(address: string): Promise<bigint> {
  const tx = await tokenClient().balance({ id: address });
  return BigInt(tx.result ?? 0);
}

export async function getSavings(address: string): Promise<bigint> {
  const tx = await vaultClient().balance_of({ user: address });
  return BigInt(tx.result ?? 0);
}

export async function getVaultTotals(): Promise<VaultTotals> {
  const [assets, shares] = await Promise.all([
    vaultClient().total_assets(),
    vaultClient().total_shares(),
  ]);
  return {
    totalAssets: BigInt(assets.result ?? 0),
    totalShares: BigInt(shares.result ?? 0),
  };
}

export async function getRule(
  address: string,
): Promise<{ enabled: boolean; save_bps: number }> {
  const tx = await routerClient().get_rule({ recipient: address });
  const r = tx.result;
  return { enabled: Boolean(r?.enabled), save_bps: Number(r?.save_bps ?? 0) };
}

function goalStatusTag(status: unknown): GoalStatus {
  const tag =
    status && typeof status === "object" && "tag" in status
      ? String((status as { tag: unknown }).tag)
      : String(status ?? "Active");
  return tag === "Reached" || tag === "Archived" ? tag : "Active";
}

export async function getGoals(address: string): Promise<Goal[]> {
  const tx = await routerClient().get_goals({ owner: address });
  const raw = (tx.result ?? []) as Array<{
    id: number;
    name: string;
    target: bigint;
    saved: bigint;
    deadline: bigint | number;
    allocation_bps: number;
    status: unknown;
  }>;
  return raw.map((g) => ({
    id: Number(g.id),
    name: g.name,
    target: BigInt(g.target ?? 0),
    saved: BigInt(g.saved ?? 0),
    deadline: Number(g.deadline ?? 0),
    allocationBps: Number(g.allocation_bps ?? 0),
    status: goalStatusTag(g.status),
  }));
}

export async function quotePlan(
  recipient: string,
  amount: bigint,
): Promise<GoalFill[]> {
  const tx = await routerClient().quote_plan({ recipient, amount });
  const raw = (tx.result ?? []) as Array<{
    goal_id: number;
    name: string;
    amount: bigint;
    reaches_target: boolean;
  }>;
  return raw.map((f) => ({
    goalId: Number(f.goal_id),
    name: f.name,
    amount: BigInt(f.amount ?? 0),
    reachesTarget: Boolean(f.reaches_target),
  }));
}

export async function getStats(address: string): Promise<AccountData["stats"]> {
  const tx = await routerClient().get_stats({ recipient: address });
  const s = tx.result;
  return {
    total_received: BigInt(s?.total_received ?? 0),
    total_saved: BigInt(s?.total_saved ?? 0),
    transfers: Number(s?.transfers ?? 0),
  };
}

/**
 * Runs one read, falling back to a default and logging rather than letting
 * its failure take the rest of the account view down with it.
 *
 * This is what `get_goals` needs right now: the goals feature's bindings are
 * built against the *new* router contract, and the one actually deployed on
 * testnet today is the pre-goals version, which genuinely has no such
 * function (`"trying to invoke non-existent contract function", get_goals`,
 * confirmed by simulating the call directly). Before this fallback existed,
 * that one rejected promise inside `Promise.all` took wallet balance, rule,
 * and stats down with it — every field showed as zero, not just goals, for
 * every address, which is exactly why a balance that is genuinely nonzero
 * on-chain rendered as 0 in the app.
 */
async function safe<T>(promise: Promise<T>, fallback: T, where: string): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    logError(e, { where });
    return fallback;
  }
}

export async function getAccountData(address: string): Promise<AccountData> {
  const [walletBalance, savings, rule, goals, stats] = await Promise.all([
    safe(getWalletBalance(address), 0n, "getAccountData.walletBalance"),
    safe(getSavings(address), 0n, "getAccountData.savings"),
    safe(getRule(address), { enabled: false, save_bps: 0 }, "getAccountData.rule"),
    safe(getGoals(address), [] as Goal[], "getAccountData.goals"),
    safe(
      getStats(address),
      { total_received: 0n, total_saved: 0n, transfers: 0 },
      "getAccountData.stats",
    ),
  ]);
  return { walletBalance, savings, rule, goals, stats };
}

export type ClaimStatus = "Pending" | "Claimed" | "Reclaimed";

export type ClaimPreview = {
  sender: string;
  amount: bigint;
  expiresAt: number;
  note: string;
  status: ClaimStatus;
};

function claimStatusTag(status: unknown): ClaimStatus {
  const tag =
    status && typeof status === "object" && "tag" in status
      ? String((status as { tag: unknown }).tag)
      : String(status ?? "Pending");
  return tag === "Claimed" || tag === "Reclaimed" ? tag : "Pending";
}

/** Preview a claim link before redeeming it. Works with no wallet connected. */
export async function getClaimPreview(claimId: bigint): Promise<ClaimPreview> {
  const tx = await claimsClient().get_claim({ claim_id: claimId });
  const c = tx.result;
  return {
    sender: c.sender,
    amount: BigInt(c.amount ?? 0),
    expiresAt: Number(c.expires_at ?? 0),
    note: c.note ?? "",
    status: claimStatusTag(c.status),
  };
}

export type CircleStatus = "Forming" | "Active" | "Completed";

export type CirclePreview = {
  token: string;
  name: string;
  contribution: bigint;
  roundSeconds: number;
  size: number;
  members: string[];
  currentRound: number;
  roundStart: number;
  contributed: boolean[];
  status: CircleStatus;
};

function circleStatusTag(status: unknown): CircleStatus {
  const tag =
    status && typeof status === "object" && "tag" in status
      ? String((status as { tag: unknown }).tag)
      : String(status ?? "Forming");
  return tag === "Active" || tag === "Completed" ? tag : "Forming";
}

/** Preview a savings circle. Works with no wallet connected. */
export async function getCirclePreview(circleId: bigint): Promise<CirclePreview> {
  const tx = await circlesClient().get_circle({ circle_id: circleId });
  const c = tx.result;
  return {
    token: c.token,
    name: c.name,
    contribution: BigInt(c.contribution ?? 0),
    roundSeconds: Number(c.round_seconds ?? 0),
    size: Number(c.size ?? 0),
    members: [...(c.members ?? [])],
    currentRound: Number(c.current_round ?? 0),
    roundStart: Number(c.round_start ?? 0),
    contributed: [...(c.contributed ?? [])],
    status: circleStatusTag(c.status),
  };
}

export async function quoteSplit(
  recipient: string,
  amount: bigint,
): Promise<Split> {
  const tx = await routerClient().quote({ recipient, amount });
  const r = tx.result;
  return { payout: BigInt(r?.payout ?? 0), saved: BigInt(r?.saved ?? 0) };
}
