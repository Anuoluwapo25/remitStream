import Link from "next/link";
import { SendPanel } from "@/components/SendPanel";

export default function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
      {/* Pitch */}
      <section className="animate-fade-in pt-4 lg:pt-8">
        <span className="pill mb-4">Built on Stellar · Soroban</span>
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Send money home.
          <br />
          <span className="bg-gradient-to-r from-brand-300 to-emerald-300 bg-clip-text text-transparent">
            Grow it while it waits.
          </span>
        </h1>
        <p className="mt-4 max-w-md text-slate-300">
          RemitStream settles cross-border transfers in seconds for a fraction
          of a cent. Recipients auto-save a slice of every remittance into an
          on-chain vault that earns yield — turning spare change into savings.
        </p>

        <ul className="mt-6 space-y-3 text-sm">
          {[
            ["⚡", "~5-second settlement", "vs. days on Western Union or bank wires"],
            ["💸", "Fees ≈ $0.00001", "makes small, frequent transfers viable"],
            ["🏦", "Auto-save with yield", "a savings product for the underbanked"],
          ].map(([icon, title, sub]) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-white/5">
                {icon}
              </span>
              <span>
                <span className="font-semibold">{title}</span>
                <span className="text-slate-400"> — {sub}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-3">
          <Link href="/dashboard" className="btn-ghost">
            I'm receiving money →
          </Link>
        </div>
      </section>

      {/* Send flow */}
      <section className="lg:sticky lg:top-20">
        <SendPanel />
      </section>
    </div>
  );
}
