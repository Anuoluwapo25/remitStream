"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccountData, getVaultTotals, type AccountData, type VaultTotals } from "./reads";
import { logError } from "./analytics";

type AccountState = {
  data: AccountData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/** Loads a user's wallet balance, savings, rule, and stats; refreshes on demand. */
export function useAccountData(address: string | null): AccountState {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const refresh = useCallback(() => {
    if (!address) {
      setData(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    getAccountData(address)
      .then((d) => {
        if (id === reqId.current) setData(d);
      })
      .catch((e) => {
        if (id === reqId.current) {
          setError("Couldn't load your account data.");
          logError(e, { where: "useAccountData" });
        }
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

/** Loads vault totals and derives a simple share price / growth figure. */
export function useVaultTotals(): {
  totals: VaultTotals | null;
  sharePrice: number;
  refresh: () => void;
} {
  const [totals, setTotals] = useState<VaultTotals | null>(null);

  const refresh = useCallback(() => {
    getVaultTotals()
      .then(setTotals)
      .catch((e) => logError(e, { where: "useVaultTotals" }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sharePrice =
    totals && totals.totalShares > 0n
      ? Number(totals.totalAssets) / Number(totals.totalShares)
      : 1;

  return { totals, sharePrice, refresh };
}
