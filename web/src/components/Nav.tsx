"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { config } from "@/lib/config";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/", label: "Send" },
  { href: "/dashboard", label: "Dashboard" },
  ...(config.circlesEnabled ? [{ href: "/circles", label: "Circles" }] : []),
  { href: "/history", label: "History" },
  { href: "/insights", label: "Insights" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-ink-900/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-300 font-display text-lg font-semibold text-ink-900">
            ₪
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">RemitStream</span>
          <span className="pill hidden sm:inline-flex">testnet</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-stone-400 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <WalletButton />
          </div>
          <button
            className="btn-ghost px-2.5 py-2 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            <span className="text-lg leading-none">{open ? "×" : "☰"}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-700 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => {
              const active =
                l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-white/10 text-white" : "text-stone-300"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 sm:hidden">
            <WalletButton showConnect />
          </div>
        </div>
      )}
    </header>
  );
}
