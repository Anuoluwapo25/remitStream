"use client";

// First-run guidance.
//
// Two pilot reports pointed at the same gap — "there should be an onboarding
// feature to guide and introduce new users to the application", and a request
// for help "for users who are new or less familiar with Web3 [to] understand
// how the application works and how to use its features".
//
// Two pieces, deliberately separate:
//
//   WelcomeGuide   a short, jargon-free explanation of what the product does,
//                  shown once. Dismissing it is remembered.
//   GettingStarted a checklist of the four things a new user has to do before
//                  the product makes sense.
//
// The checklist reads its state from the chain rather than from a local "seen
// it" flag, so it reflects what the wallet has actually done. It is therefore
// correct on a second device, after clearing storage, and for someone who was
// onboarded by a friend rather than by this screen — and it can never claim a
// step is done when it isn't.

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import type { AccountData } from "@/lib/reads";
import { fetchSignedHistory } from "@/lib/history";
import { track } from "@/lib/analytics";

const SEEN_KEY = "rs.onboarding.seen";
const CHECKLIST_HIDDEN_KEY = "rs.onboarding.checklistHidden";

/* ------------------------------------------------------------ welcome modal */

const STEPS = [
  {
    icon: "👛",
    title: "Connect a Stellar wallet",
    body: "RemitStream never holds your money. You approve every transfer from your own wallet, and nobody else can move your funds — not even us.",
  },
  {
    icon: "💸",
    title: "Send money in about five seconds",
    body: "Enter who you're paying and how much. The transfer settles on Stellar for a fraction of a cent, instead of days and 6–8% in fees.",
  },
  {
    icon: "🏦",
    title: "The recipient saves a slice automatically",
    body: "Whoever receives the money picks a percentage once — say 20% — and every transfer after that is split for them. They can withdraw those savings whenever they want.",
  },
];

export function WelcomeGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Rendered client-side only, so a returning visitor never sees a flash.
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setOpen(true);
        track("onboarding_shown");
      }
    } catch {
      /* storage blocked — just don't show the guide */
    }
  }, []);

  const close = useCallback(
    (completed: boolean) => {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      track(completed ? "onboarding_completed" : "onboarding_skipped", { step });
      setOpen(false);
    },
    [step],
  );

  if (!open) return null;
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[1095] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="card w-full max-w-lg animate-fade-in p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <span className="pill mb-2">New here?</span>
            <h2 id="welcome-title" className="text-xl font-bold tracking-tight">
              Send money home, and help it grow
            </h2>
          </div>
          <button
            onClick={() => close(false)}
            className="text-2xl leading-none text-slate-500 hover:text-white"
            aria-label="Skip introduction"
          >
            ×
          </button>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white/5 text-2xl">
            {current.icon}
          </span>
          <div>
            <h3 className="font-semibold">{current.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              {current.body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-brand-400" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="btn-ghost px-3 py-2 text-sm"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? close(true) : setStep((s) => s + 1))}
              className="btn-primary px-4 py-2 text-sm"
            >
              {last ? "Get started" : "Next"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Running on Stellar testnet — the money isn&apos;t real, so try
          anything you like.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- checklist */

/** Has this wallet ever signed a remittance? One Horizon round trip. */
function useHasSent(address: string | null): boolean | null {
  const [hasSent, setHasSent] = useState<boolean | null>(null);

  useEffect(() => {
    if (!address) {
      setHasSent(null);
      return;
    }
    let live = true;
    fetchSignedHistory(address)
      .then((entries) => {
        if (live) setHasSent(entries.some((e) => e.kind === "sent" && e.success));
      })
      .catch(() => {
        // Unknown rather than false: better to leave the step unticked quietly
        // than to tell someone they haven't done something they have.
        if (live) setHasSent(null);
      });
    return () => {
      live = false;
    };
  }, [address]);

  return hasSent;
}

type Task = { id: string; label: string; hint: string; done: boolean };

export function GettingStarted({ data }: { data: AccountData | null }) {
  const { address, connect } = useWallet();
  const hasSent = useHasSent(address);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(CHECKLIST_HIDDEN_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const tasks: Task[] = [
    {
      id: "connect",
      label: "Connect your wallet",
      hint: "Freighter, xBull, Albedo, Lobstr and hardware wallets all work.",
      done: !!address,
    },
    {
      id: "funds",
      label: "Get some test rUSDC",
      hint: "One tap of “Get test rUSDC” — no trustline setup needed.",
      done: (data?.walletBalance ?? 0n) > 0n,
    },
    {
      id: "rule",
      label: "Pick your auto-save rate",
      hint: "Set on the dashboard. It decides how much of each transfer you receive is saved for you.",
      done: (data?.rule.save_bps ?? 0) > 0,
    },
    {
      id: "send",
      label: "Send your first transfer",
      hint: "Paste any Stellar address and an amount. It settles in about five seconds.",
      done: hasSent === true,
    },
  ];

  const doneCount = tasks.filter((t) => t.done).length;

  // Nothing left to nag about, or the user asked it to go away.
  if (hidden || doneCount === tasks.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(CHECKLIST_HIDDEN_KEY, "1");
    } catch {
      /* ignore */
    }
    track("onboarding_checklist_dismissed", { doneCount });
    setHidden(true);
  };

  const next = tasks.find((t) => !t.done);

  return (
    <div className="card animate-fade-in p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Getting started</h2>
          <p className="text-xs text-slate-400">
            {doneCount} of {tasks.length} done
            {next ? ` · next: ${next.label.toLowerCase()}` : ""}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Hide
        </button>
      </div>

      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={tasks.length}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all"
          style={{ width: `${(doneCount / tasks.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-2.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border text-[11px] font-bold ${
                task.done
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                  : "border-white/15 bg-white/5 text-slate-500"
              }`}
              aria-hidden
            >
              {task.done ? "✓" : ""}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-medium ${
                  task.done ? "text-slate-500 line-through" : "text-slate-100"
                }`}
              >
                {task.label}
              </span>
              {!task.done && (
                <span className="block text-xs text-slate-400">{task.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {!address && (
        <button onClick={() => connect()} className="btn-primary mt-4 w-full">
          Connect wallet
        </button>
      )}
    </div>
  );
}
