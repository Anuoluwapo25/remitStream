// Read-only, on-chain views. Each runs a simulation via the RPC and returns the
// parsed result. No wallet or signature required.

import { tokenClient, vaultClient, routerClient } from "./contracts";

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

export async function getAccountData(address: string): Promise<AccountData> {
  const [walletBalance, savings, rule, goals, stats] = await Promise.all([
    getWalletBalance(address),
    getSavings(address),
    getRule(address),
    getGoals(address),
    getStats(address),
  ]);
  return { walletBalance, savings, rule, goals, stats };
}

export async function quoteSplit(
  recipient: string,
  amount: bigint,
): Promise<Split> {
  const tx = await routerClient().quote({ recipient, amount });
  const r = tx.result;
  return { payout: BigInt(r?.payout ?? 0), saved: BigInt(r?.saved ?? 0) };
}
