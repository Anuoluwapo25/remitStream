"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccountData, getVaultTotals, type AccountData, type VaultTotals } from "./reads";
import {
  fetchRoutedEvents,
  fetchSignedHistory,
  mergeHistory,
  type History,
} from "./history";
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

/**
 * Loads a wallet's on-chain transaction history in two phases.
 *
 * The signed half returns in one round trip; the router's event feed has to
 * scan a week of ledgers and takes seconds on a cold cache. Rendering waits
 * only on the fast half, and incoming transfers are folded in when they land.
 */
export function useHistory(address: string | null): {
  history: History | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const refresh = useCallback(() => {
    if (!address) {
      setHistory(null);
      return;
    }
    const id = ++reqId.current;
    const current = () => id === reqId.current;

    setLoading(true);
    setError(null);

    const eventsPromise = fetchRoutedEvents();
    // Nothing awaits this until the signed half resolves; claim the rejection
    // now so it never surfaces as an unhandled promise.
    eventsPromise.catch(() => {});

    fetchSignedHistory(address)
      .then((signed) => {
        if (!current()) return;
        setHistory({
          entries: mergeHistory(address, signed, []),
          eventsCovered: false,
          eventsPending: true,
        });
        setLoading(false);

        return eventsPromise.then(
          (routed) => {
            if (!current()) return;
            setHistory({
              entries: mergeHistory(address, signed, routed),
              eventsCovered: true,
              eventsPending: false,
            });
          },
          (e) => {
            if (!current()) return;
            // The signed half is already on screen; the panel explains the gap.
            setHistory({
              entries: mergeHistory(address, signed, []),
              eventsCovered: false,
              eventsPending: false,
            });
            logError(e, { where: "useHistory.events" });
          },
        );
      })
      .catch((e) => {
        if (!current()) return;
        setError("Couldn't load your transaction history.");
        setLoading(false);
        logError(e, { where: "useHistory" });
      });
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, loading, error, refresh };
}
