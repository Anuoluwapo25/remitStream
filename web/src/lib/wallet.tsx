"use client";

// Wallet connection via Stellar Wallets Kit v2.5 (Freighter, xBull, Albedo,
// Lobstr, Hana, hardware wallets…). The kit's API is fully static in v2.5:
// StellarWalletsKit.init() once, then authModal()/getAddress()/signTransaction().
//
// Exposes a `useWallet` hook with the connected address and a `signer` object
// shaped for the contract bindings' signTransaction option.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { config } from "./config";
import type { Signer } from "./contracts";
import { track } from "./analytics";

const ADDRESS_KEY = "rs.wallet.address";
const WALLET_KEY = "rs.wallet.id";

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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Restore a previous session without popping the modal.
  useEffect(() => {
    ensureInit();
    const savedAddr = localStorage.getItem(ADDRESS_KEY);
    const savedWallet = localStorage.getItem(WALLET_KEY);
    if (savedAddr && savedWallet) {
      try {
        StellarWalletsKit.setWallet(savedWallet);
        setAddress(savedAddr);
      } catch {
        localStorage.removeItem(ADDRESS_KEY);
        localStorage.removeItem(WALLET_KEY);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    ensureInit();
    setConnecting(true);
    try {
      const { address: addr } = await StellarWalletsKit.authModal();
      setAddress(addr);
      localStorage.setItem(ADDRESS_KEY, addr);
      const walletId = StellarWalletsKit.selectedModule?.productId;
      if (walletId) localStorage.setItem(WALLET_KEY, walletId);
      track("wallet_connected", { wallet: walletId });
    } catch (err) {
      // Modal dismissed or wallet unavailable — swallow, the UI stays disconnected.
      if (err) track("wallet_connect_failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      /* ignore */
    }
    setAddress(null);
    localStorage.removeItem(ADDRESS_KEY);
    localStorage.removeItem(WALLET_KEY);
    track("wallet_disconnected");
  }, []);

  const signer = useMemo<Signer | null>(() => {
    if (!address) return null;
    return {
      publicKey: address,
      signTransaction: async (xdr: string) => {
        const { signedTxXdr, signerAddress } =
          await StellarWalletsKit.signTransaction(xdr, {
            address,
            networkPassphrase: config.networkPassphrase,
          });
        return { signedTxXdr, signerAddress };
      },
    };
  }, [address]);

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
