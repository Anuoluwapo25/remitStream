"use client";

// Rotating savings circles — ajo, esusu, susu, chama, tanda, cundina. A
// fixed group each pays the same amount every round; the whole pot goes to
// a different member each round until everyone's had it once. Funds sit in
// the contract, not with a treasurer, and a round only pays out once every
// member in it has paid in. See contracts/savings-circle for the mechanics.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { config } from "@/lib/config";
import { createCircle } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { toBaseUnits } from "@/lib/format";
import { track } from "@/lib/analytics";
import { bookmarkCircle, bookmarkedCircleIds } from "@/lib/circleBookmarks";
import { useToast } from "@/components/Toast";
import { SectionTitle } from "@/components/ui";

const ROUND_OPTIONS = [
  { label: "Weekly", seconds: 7 * 24 * 60 * 60 },
  { label: "Every 2 weeks", seconds: 14 * 24 * 60 * 60 },
  { label: "Monthly", seconds: 30 * 24 * 60 * 60 },
];

export default function CirclesPage() {
  const { address, signer, connect } = useWallet();
  const toast = useToast();
  const router = useRouter();

  const [mine, setMine] = useState<string[]>([]);
  const [openId, setOpenId] = useState("");

  const [name, setName] = useState("");
  const [contribution, setContribution] = useState("");
  const [size, setSize] = useState(5);
  const [roundSeconds, setRoundSeconds] = useState(ROUND_OPTIONS[2].seconds);
  const [creating, setCreating] = useState(false);

  useEffect(() => setMine(bookmarkedCircleIds()), []);

  async function create() {
    if (!signer) return;
    const units = toBaseUnits(contribution);
    if (units <= 0n || !name.trim()) return;
    setCreating(true);
    try {
      const { result: id, txHash } = await createCircle(signer, {
        token: config.contracts.token,
        name: name.trim(),
        contribution: units,
        roundSeconds,
        size,
      });
      track("circle_created", { circle_id: id.toString(), size, txHash });
      bookmarkCircle(id.toString());
      toast.success(`"${name.trim()}" created`, txHash);
      router.push(`/circles/${id.toString()}`);
    } catch (e) {
      toast.error(humanizeError(e, "circles"));
    } finally {
      setCreating(false);
    }
  }

  if (!config.circlesEnabled) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center text-sm text-stone-400">
        Savings circles aren&apos;t live on this deployment yet — check back
        soon.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Savings circles</h1>
        <p className="mt-1 text-sm text-stone-400">
          Ajo, esusu, susu, chama, tanda — a group saving circle, enforced by
          the contract instead of a treasurer. Everyone pays in each round;
          one member gets the whole pot, on rotation, until everyone has.
        </p>
      </div>

      <div className="card p-5">
        <SectionTitle>Open a circle</SectionTitle>
        <div className="flex gap-2">
          <input
            value={openId}
            onChange={(e) => setOpenId(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Circle ID"
            className="input"
          />
          <button
            onClick={() => openId && router.push(`/circles/${openId}`)}
            disabled={!openId}
            className="btn-ghost flex-none px-4"
          >
            Open
          </button>
        </div>
        {mine.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {mine.map((id) => (
              <button
                key={id}
                onClick={() => router.push(`/circles/${id}`)}
                className="pill hover:bg-white/10"
              >
                Circle #{id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <SectionTitle>Start a new circle</SectionTitle>
        {!address ? (
          <button className="btn-primary w-full" onClick={() => connect()}>
            Connect wallet to start a circle
          </button>
        ) : (
          <>
            <label className="label">What's it for?</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 48))}
              placeholder="Christmas ajo"
              className="input"
              disabled={creating}
            />

            <label className="label mt-3">
              Contribution per round ({config.assetCode})
            </label>
            <input
              value={contribution}
              onChange={(e) =>
                setContribution(e.target.value.replace(/[^0-9.]/g, ""))
              }
              inputMode="decimal"
              placeholder="50.00"
              className="input"
              disabled={creating}
            />

            <label className="label mt-3">Members (2–12)</label>
            <input
              type="range"
              min={2}
              max={12}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full accent-brand-500"
              disabled={creating}
            />
            <div className="text-right text-sm font-semibold text-brand-300">
              {size} people
            </div>

            <label className="label mt-3">Round length</label>
            <div className="flex flex-wrap gap-2">
              {ROUND_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setRoundSeconds(opt.seconds)}
                  disabled={creating}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    roundSeconds === opt.seconds
                      ? "border-brand-400/60 bg-brand-500/15 text-brand-100"
                      : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-stone-500">
              You&apos;ll be the first member — first to join gets paid first,
              in the order people join.
            </p>

            <button
              onClick={create}
              disabled={creating || !name.trim() || toBaseUnits(contribution) <= 0n}
              className="btn-primary mt-4 w-full py-3"
            >
              {creating ? "Creating…" : "Create circle"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
