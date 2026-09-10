"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useAccountData, useVaultTotals } from "@/lib/hooks";
import { withdrawSavings, withdrawAllSavings } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { fromBaseUnits, toBaseUnits, money } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useToast } from "./Toast";
import { FaucetButton } from "./FaucetButton";
import { GoalsBoard } from "./GoalsBoard";
import { Stat, Skeleton, SectionTitle } from "./ui";

export function DashboardPanel() {
  const { address, signer, connect } = useWallet();
  const { data, loading, refresh } = useAccountData(address);
  const { sharePrice, refresh: refreshVault } = useVaultTotals();
  const toast = useToast();

  if (!address) {
    return (
      <div className="card p-6 text-center">
        <p className="mb-4 text-slate-300">
          Connect your wallet to manage savings and see your remittance history.
        </p>
        <button className="btn-primary mx-auto" onClick={() => connect()}>
          Connect wallet
        </button>
      </div>
    );
  }

  const savings = data?.savings ?? 0n;
  const walletBal = data?.walletBalance ?? 0n;
  const principal = data?.stats.total_saved ?? 0n;
  const yieldEarned = savings > principal ? savings - principal : 0n;
  const growthPct = sharePrice > 1 ? (sharePrice - 1) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Balances */}
      <div className="grid gap-3 sm:grid-cols-3">
        {loading && !data ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <Stat label="In wallet" value={money(walletBal)} />
            <Stat
              label="In savings vault"
              value={money(savings)}
              accent
              sub={
                growthPct > 0
                  ? `vault +${growthPct.toFixed(2)}% since launch`
                  : "earning yield"
              }
            />
            <Stat
              label="Yield earned (est.)"
              value={money(yieldEarned)}
              sub="on auto-saved funds"
            />
          </>
        )}
      </div>

      <GoalsBoard
        goals={data?.goals ?? []}
        loading={loading && !data}
        onChange={() => {
          refresh();
          refreshVault();
        }}
      />

      <WithdrawCard
        savings={savings}
        disabled={!signer}
        onDone={() => {
          refresh();
          refreshVault();
        }}
      />

      {/* Lifetime stats */}
      <div>
        <SectionTitle hint="on-chain, all-time">Your activity</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Total received"
            value={money(data?.stats.total_received ?? 0n)}
          />
          <Stat
            label="Total auto-saved"
            value={money(principal)}
            accent
          />
          <Stat
            label="Remittances received"
            value={String(data?.stats.transfers ?? 0)}
          />
        </div>
      </div>

      <div className="card flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="text-sm text-slate-400">
          Need test funds to try a self-transfer or top up?
        </div>
        <FaucetButton onDone={refresh} />
      </div>
    </div>
  );

  // toast is referenced by children via closures; keep lint happy
  void toast;
}

function WithdrawCard({
  savings,
  disabled,
  onDone,
}: {
  savings: bigint;
  disabled: boolean;
  onDone: () => void;
}) {
  const { signer } = useWallet();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const units = toBaseUnits(amount);
  const over = units > savings;
  const canWithdraw = !!signer && units > 0n && !over && !busy;

  async function doWithdraw(all: boolean) {
    if (!signer) return;
    setBusy(true);
    try {
      const { txHash } = all
        ? await withdrawAllSavings(signer)
        : await withdrawSavings(signer, units);
      track("savings_withdrawn", {
        ...(all ? { all: true } : { amount: Number(units) }),
        txHash,
      });
      toast.success("Withdrawn to your wallet", txHash);
      setAmount("");
      onDone();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <SectionTitle hint={money(savings)}>Withdraw savings</SectionTitle>
      <p className="mb-4 text-sm text-slate-400">
        Move funds from your vault back to your wallet anytime — including any
        yield earned.
      </p>

      <div className="relative">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="0.00"
          className="input pr-16 text-lg"
          disabled={disabled || savings === 0n}
        />
        <button
          type="button"
          onClick={() => setAmount(fromBaseUnits(savings, { grouped: false }))}
          disabled={savings === 0n}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium hover:bg-white/20"
        >
          Max
        </button>
      </div>
      {over && (
        <p className="mt-1.5 text-xs text-rose-300">
          You only have {money(savings)} saved.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => doWithdraw(false)}
          disabled={!canWithdraw}
          className="btn-primary flex-1"
        >
          {busy ? "Working…" : "Withdraw"}
        </button>
        <button
          onClick={() => doWithdraw(true)}
          disabled={disabled || savings === 0n || busy}
          className="btn-ghost"
        >
          All
        </button>
      </div>
    </div>
  );
}
