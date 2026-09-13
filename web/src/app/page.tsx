import Link from "next/link";
import { SendTabs } from "@/components/SendTabs";
import { HeroCta } from "@/components/HeroCta";
import { SlidersIcon, SendIcon, VaultIcon } from "@/components/icons";

const STEPS = [
  {
    icon: <SlidersIcon className="h-[18px] w-[18px]" />,
    title: "Set a savings goal",
    body: "The recipient names what they're saving for and gives it a slice of every transfer. Once, in one signature.",
  },
  {
    icon: <SendIcon className="h-[18px] w-[18px]" />,
    title: "Send as normal",
    body: "An address and an amount. It settles in about five seconds for a fraction of a cent.",
  },
  {
    icon: <VaultIcon className="h-[18px] w-[18px]" />,
    title: "It arrives split",
    body: "Spending money in the wallet, the rest filling their goals in a vault — withdrawable at any time.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-14 pt-4 sm:pt-10">
      <div className="grid gap-12 lg:grid-cols-[1fr_27rem] lg:items-start lg:gap-16">
        <section className="animate-fade-in">
          <span className="pill">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            Live on Stellar testnet
          </span>

          {/* The break is explicit: left to wrap, the last word orphans onto a
              line of its own at most desktop widths. */}
          <h1 className="mt-6 text-[2.5rem] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[3.25rem]">
            Send money home.
            <br />
            <span className="text-brand-300">Grow it while it waits.</span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-stone-400">
            Transfers settle in seconds for a fraction of a cent — and the
            person receiving them saves a slice of every one, automatically,
            into a vault they control.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <HeroCta />
            <Link
              href="/dashboard"
              className="text-sm font-medium text-stone-300 transition hover:text-white"
            >
              I&apos;m receiving money →
            </Link>
          </div>
        </section>

        <section id="send" className="scroll-mt-24 lg:sticky lg:top-20">
          <SendTabs />
        </section>
      </div>

      <section className="border-t border-white/10 pt-10">
        <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <div className="flex items-center gap-2.5 text-stone-500">
                <span className="text-brand-400">{step.icon}</span>
                <span className="text-xs font-medium tabular-nums">
                  0{i + 1}
                </span>
              </div>
              <h2 className="mt-3 text-[15px] font-semibold">{step.title}</h2>
              <p className="mt-1.5 max-w-[38ch] text-sm leading-relaxed text-stone-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
