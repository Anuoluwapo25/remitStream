import type { ReactNode } from "react";
import { explorerTx } from "@/lib/config";
import { shortAddress } from "@/lib/format";

/**
 * Link to a transaction on the block explorer.
 *
 * Shown wherever the app confirms that something settled. Pilot users had to
 * go digging in their wallet extension to find a transfer on-chain, so every
 * confirmation now carries its own receipt.
 */
export function TxLink({
  hash,
  label = "View on explorer",
  className = "",
}: {
  hash: string | null | undefined;
  label?: string;
  className?: string;
}) {
  if (!hash) return null;
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noreferrer"
      title={hash}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-brand-300 hover:underline ${className}`}
    >
      {label}
      <span className="font-mono text-stone-500">{shortAddress(hash, 6, 4)}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-400">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${
          accent ? "text-brand-300" : "text-white"
        }`}
      >
        {value}
      </div>
      {sub != null && <div className="mt-1 text-xs text-stone-400">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-semibold">{children}</h2>
      {hint != null && <span className="text-xs text-stone-400">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-12 text-center text-sm text-stone-400">
      {children}
    </div>
  );
}
