"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TxLink } from "./ui";

type ToastKind = "success" | "error" | "info";
type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  /** Transaction hash, rendered as an explorer link inside the toast. */
  txHash?: string | null;
};

type ToastApi = {
  toast: (message: string, kind?: ToastKind, txHash?: string | null) => void;
  success: (message: string, txHash?: string | null) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
};
const STYLES: Record<ToastKind, string> = {
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  info: "border-brand-400/30 bg-brand-500/10 text-brand-100",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info", txHash?: string | null) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message, txHash }]);
      // Toasts carrying a receipt linger, so there is time to click through.
      setTimeout(() => remove(id), txHash ? 10_000 : 5_000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m, txHash) => toast(m, "success", txHash),
      error: (m) => toast(m, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${STYLES[t.kind]}`}
          >
            <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-white/10 text-xs font-bold">
              {ICONS[t.kind]}
            </span>
            <span className="flex-1">
              {t.message}
              {t.txHash && (
                <span className="mt-1 block">
                  <TxLink hash={t.txHash} />
                </span>
              )}
            </span>
            <button
              onClick={() => remove(t.id)}
              className="text-slate-400 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
