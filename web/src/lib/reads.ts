// Read-only, on-chain views. Each runs a simulation via the RPC and returns the
// parsed result. No wallet or signature required.

import { tokenClient, vaultClient, routerClient } from "./contracts";

export type AccountData = {
  walletBalance: bigint;
  savings: bigint;
  rule: { enabled: boolean; save_bps: number };
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
  const [walletBalance, savings, rule, stats] = await Promise.all([
    getWalletBalance(address),
    getSavings(address),
    getRule(address),
    getStats(address),
  ]);
  return { walletBalance, savings, rule, stats };
}

export async function quoteSplit(
  recipient: string,
  amount: bigint,
): Promise<Split> {
  const tx = await routerClient().quote({ recipient, amount });
  const r = tx.result;
  return { payout: BigInt(r?.payout ?? 0), saved: BigInt(r?.saved ?? 0) };
}
