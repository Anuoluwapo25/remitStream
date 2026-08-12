"use client";

// Wallet connection via Stellar Wallets Kit v2.5 (Freighter, xBull, Albedo,
// Lobstr, Hana, hardware wallets…). The kit's API is fully static in v2.5:
// StellarWalletsKit.init() once, then authModal()/getAddress()/signTransaction().
//
// Exposes a `useWallet` hook with the connected address and a `signer` object
// shaped for the contract bindings' signTransaction option.
//
// Sessions are revalidated rather than trusted. A pilot user reported:
//
//   "When the session expires, the UI still shows that the account is
//    connected. I have to manually disconnect and reconnect the wallet, then
//    refresh the page before I can perform transactions again. This could be
//    improved by automatically disconnecting the wallet when the session
//    expires or when there has been no activity for a certain period."
//
// The cause was that a restored session was taken at face value: the address
// came out of localStorage and nothing ever asked the wallet whether it was
// still unlocked. Now the app re-checks with the wallet on restore and whenever
// the tab is brought back into focus, and drops an idle session on its own.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { config } from "./config";
import type { Signer } from "./contracts";
import { track } from "./analytics";
import { useToast } from "@/components/Toast";

const ADDRESS_KEY = "rs.wallet.address";
const WALLET_KEY = "rs.wallet.id";
const ACTIVITY_KEY = "rs.wallet.lastActive";

/** Disconnect after this long with no interaction. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** How often the idle clock is checked. */
const IDLE_CHECK_MS = 60 * 1000;
/**
 * Floor between wallet liveness checks. Some modules (hardware wallets, or
 * Freighter before permission is granted) can prompt on `fetchAddress`, so this
 * stays deliberately infrequent rather than firing on every focus event.
 */
const REVALIDATE_INTERVAL_MS = 60 * 1000;
/**
 * Consecutive failed liveness checks before the session is dropped. A single
 * throw is not proof of an expired session — a hardware wallet can be briefly
 * unreachable, or a prompt dismissed — and disconnecting someone mid-task on a
 * transient error would be a worse bug than the one this fixes.
 */
const REVALIDATE_FAILURES_BEFORE_DISCONNECT = 2;

type WalletState = {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signer: Signer | null;
};

const WalletContext = createContext<WalletState | null>(null);

let initialized = false;
function ensureInit() {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: config.network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
  });
  initialized = true;
}

function clearStored() {
  localStorage.removeItem(ADDRESS_KEY);
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const toast = useToast();

  const addressRef = useRef<string | null>(null);
  addressRef.current = address;
  const lastCheckRef = useRef(0);
  const failuresRef = useRef(0);

  const markActive = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    } catch {
      /* storage blocked — the idle check simply won't fire */
    }
  }, []);

  /** Drop the session locally. `reason` is shown to the user when set. */
  const endSession = useCallback(
    async (reason?: string) => {
      try {
        await StellarWalletsKit.disconnect();
      } catch {
        /* the wallet may already be gone; local state is what matters */
      }
      clearStored();
      setAddress(null);
      if (reason) toast.toast(reason, "info");
    },
    [toast],
  );

  const disconnect = useCallback(async () => {
    await endSession();
    track("wallet_disconnected");
  }, [endSession]);

  /**
   * Ask the wallet whether it still has a live session for this address.
   *
   * Throttled, and a no-op when nothing is connected. A thrown error means the
   * wallet is locked or has forgotten us; a different address means the user
   * switched accounts in the extension, which we follow rather than fight.
   */
  const revalidate = useCallback(async () => {
    const current = addressRef.current;
    if (!current) return;
    if (Date.now() - lastCheckRef.current < REVALIDATE_INTERVAL_MS) return;
    lastCheckRef.current = Date.now();

    try {
      const { address: live } = await StellarWalletsKit.fetchAddress();
      if (!live) throw new Error("no address");
      failuresRef.current = 0;
      if (live !== addressRef.current) {
        setAddress(live);
        localStorage.setItem(ADDRESS_KEY, live);
        track("wallet_account_switched");
        toast.toast("Switched to the account now active in your wallet.", "info");
      }
    } catch {
      failuresRef.current += 1;
      if (failuresRef.current < REVALIDATE_FAILURES_BEFORE_DISCONNECT) {
        // Retry sooner than the usual throttle so a real expiry is caught
        // quickly, without acting on one unreliable answer.
        lastCheckRef.current = 0;
        return;
      }
      track("wallet_session_expired");
      await endSession(
        "Your wallet session ended, so RemitStream disconnected. Reconnect to keep going.",
      );
    }
  }, [endSession, toast]);

  // Restore a previous session without popping the modal, then confirm with the
  // wallet that the session is actually still alive.
  useEffect(() => {
    ensureInit();
    const savedAddr = localStorage.getItem(ADDRESS_KEY);
    const savedWallet = localStorage.getItem(WALLET_KEY);
    if (!savedAddr || !savedWallet) return;

    // An idle session is stale before we even ask the wallet.
    const lastActive = Number(localStorage.getItem(ACTIVITY_KEY) ?? 0);
    if (lastActive && Date.now() - lastActive > IDLE_LIMIT_MS) {
      clearStored();
      return;
    }

    try {
      StellarWalletsKit.setWallet(savedWallet);
      setAddress(savedAddr);
      addressRef.current = savedAddr;
      void revalidate();
    } catch {
      clearStored();
    }
    // Runs once on mount; revalidate is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check when the tab comes back — the usual way a session dies unnoticed
  // is the wallet auto-locking while the app sits in a background tab.
  useEffect(() => {
    if (!address) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [address, revalidate]);

  // Track interaction so the idle clock reflects real use.
  useEffect(() => {
    if (!address) return;
    markActive();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    for (const e of events)
      window.addEventListener(e, markActive, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, markActive);
    };
  }, [address, markActive]);

  // Drop an idle session on our own, without waiting for the wallet to lock.
  useEffect(() => {
    if (!address) return;
    const timer = setInterval(() => {
      const lastActive = Number(localStorage.getItem(ACTIVITY_KEY) ?? 0);
      if (lastActive && Date.now() - lastActive > IDLE_LIMIT_MS) {
        track("wallet_idle_timeout");
        void endSession(
          "Disconnected after 30 minutes of inactivity. Reconnect when you're ready.",
        );
      }
    }, IDLE_CHECK_MS);
    return () => clearInterval(timer);
  }, [address, endSession]);

  const connect = useCallback(async () => {
    ensureInit();
    setConnecting(true);
    try {
      const { address: addr } = await StellarWalletsKit.authModal();
      setAddress(addr);
      addressRef.current = addr;
      lastCheckRef.current = Date.now();
      localStorage.setItem(ADDRESS_KEY, addr);
      const walletId = StellarWalletsKit.selectedModule?.productId;
      if (walletId) localStorage.setItem(WALLET_KEY, walletId);
      markActive();
      track("wallet_connected", { wallet: walletId });
    } catch (err) {
      // Modal dismissed or wallet unavailable — swallow, the UI stays disconnected.
      if (err) track("wallet_connect_failed");
    } finally {
      setConnecting(false);
    }
  }, [markActive]);

  const signer = useMemo<Signer | null>(() => {
    if (!address) return null;
    return {
      publicKey: address,
      signTransaction: async (xdr: string) => {
        markActive();
        try {
          const { signedTxXdr, signerAddress } =
            await StellarWalletsKit.signTransaction(xdr, {
              address,
              networkPassphrase: config.networkPassphrase,
            });
          return { signedTxXdr, signerAddress };
        } catch (err) {
          // A signing failure is the most reliable signal that a session died,
          // so use it to re-check rather than leaving a dead session on screen.
          lastCheckRef.current = 0;
          void revalidate();
          throw err;
        }
      },
    };
  }, [address, markActive, revalidate]);

  const value = useMemo(
    () => ({ address, connecting, connect, disconnect, signer }),
    [address, connecting, connect, disconnect, signer],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
