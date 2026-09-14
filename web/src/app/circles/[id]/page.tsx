"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { config } from "@/lib/config";
import { getCirclePreview, type CirclePreview } from "@/lib/reads";
import { joinCircle, contributeToCircle, reclaimStalledRound } from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { money, shortAddress } from "@/lib/format";
import { track } from "@/lib/analytics";
import { bookmarkCircle } from "@/lib/circleBookmarks";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/ui";

function parseId(raw: string | string[] | undefined): bigint | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s || !/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function roundLengthLabel(seconds: number): string {
  const days = seconds / 86_400;
  if (days === 7) return "weekly";
  if (days === 14) return "every 2 weeks";
  if (days === 30) return "monthly";
  return `every ${Math.round(days)} days`;
}

export default function CircleDetailPage() {
  const params = useParams<{ id: string }>();
  const circleId = parseId(params?.id);
  const { address, signer, connect } = useWallet();
  const toast = useToast();

  const [circle, setCircle] = useState<CirclePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (circleId === null) {
      setLoadError("That's not a valid circle ID.");
      setLoading(false);
      return;
    }
    getCirclePreview(circleId)
      .then((c) => {
        setCircle(c);
        setLoadError(null);
      })
      .catch((e) => setLoadError(humanizeError(e, "circles")))
      .finally(() => setLoading(false));
  }, [circleId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (circleId !== null && circle) bookmarkCircle(circleId.toString());
  }, [circleId, circle]);

  const myIndex = address && circle ? circle.members.indexOf(address) : -1;
  const isMember = myIndex >= 0;
  const iHaveContributed = isMember && circle ? circle.contributed[myIndex] : false;
  const roundStalled =
    circle?.status === "Active" &&
    circle.roundStart > 0 &&
    Date.now() / 1000 > circle.roundStart + circle.roundSeconds;

  async function doJoin() {
    if (!signer || circleId === null) return;
    setBusy(true);
    try {
      const { txHash } = await joinCircle(signer, circleId);
      track("circle_joined", { circle_id: circleId.toString(), txHash });
      toast.success("Joined the circle", txHash);
      load();
    } catch (e) {
      toast.error(humanizeError(e, "circles"));
    } finally {
      setBusy(false);
    }
  }

  async function doContribute() {
    if (!signer || circleId === null) return;
    setBusy(true);
    try {
      const { txHash } = await contributeToCircle(signer, circleId);
      track("circle_contributed", { circle_id: circleId.toString(), txHash });
      toast.success("Paid into this round", txHash);
      load();
    } catch (e) {
      toast.error(humanizeError(e, "circles"));
    } finally {
      setBusy(false);
    }
  }

  async function doReclaim() {
    if (!signer || circleId === null) return;
    setBusy(true);
    try {
      const { txHash } = await reclaimStalledRound(signer, circleId);
      track("circle_reclaimed", { circle_id: circleId.toString(), txHash });
      toast.success("Contribution returned to your wallet", txHash);
      load();
    } catch (e) {
      toast.error(humanizeError(e, "circles"));
    } finally {
      setBusy(false);
    }
  }

  if (!config.circlesEnabled) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center text-sm text-stone-400">
        Savings circles aren&apos;t live on this deployment yet.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-3 pt-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (loadError || !circle) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center text-sm text-flag-200">
        {loadError ?? "Couldn't load this circle."}
      </div>
    );
  }

  const paidCount = circle.contributed.filter(Boolean).length;

  return (
    <div className="mx-auto max-w-lg space-y-5 pt-4">
      <div>
        <span className="pill capitalize">{circle.status.toLowerCase()}</span>
        <h1 className="font-display mt-2 text-2xl font-semibold">{circle.name}</h1>
        <p className="mt-1 text-sm text-stone-400">
          {money(circle.contribution)} per member, {roundLengthLabel(circle.roundSeconds)}
          {" · "}
          {circle.size} members {circle.status === "Forming" && `(${circle.members.length}/${circle.size} joined)`}
        </p>
      </div>

      {circle.status === "Active" && (
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-stone-400">
              Round {circle.currentRound + 1} of {circle.size}
            </span>
            <span className="font-semibold text-brand-300">
              {paidCount}/{circle.size} paid in
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: `${(paidCount / circle.size) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Pays {money(circle.contribution * BigInt(circle.size))} to{" "}
            {shortAddress(circle.members[circle.currentRound] ?? "")} once
            everyone's in.
          </p>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-stone-300">Members</h2>
        <div className="space-y-2">
          {circle.members.map((m, i) => (
            <div key={m} className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 flex-none rounded-full ${
                  circle.status === "Active" && circle.contributed[i]
                    ? "bg-accent-400"
                    : i === circle.currentRound && circle.status === "Active"
                      ? "bg-brand-400"
                      : "bg-white/15"
                }`}
              />
              <span className="font-mono text-stone-300">
                {shortAddress(m)}
                {m === address ? " (you)" : ""}
              </span>
              {i === circle.currentRound && circle.status === "Active" && (
                <span className="pill ml-auto text-[10px]">receiving this round</span>
              )}
            </div>
          ))}
          {circle.status === "Forming" &&
            Array.from({ length: circle.size - circle.members.length }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center gap-2 text-sm text-stone-600">
                <span className="h-2 w-2 flex-none rounded-full border border-dashed border-white/20" />
                open slot
              </div>
            ))}
        </div>
      </div>

      <div className="card p-5">
        {!address ? (
          <button className="btn-primary w-full" onClick={() => connect()}>
            Connect wallet
          </button>
        ) : circle.status === "Forming" ? (
          isMember ? (
            <p className="text-center text-sm text-stone-400">
              Waiting for {circle.size - circle.members.length} more member
              {circle.size - circle.members.length === 1 ? "" : "s"} to join.
            </p>
          ) : (
            <button onClick={doJoin} disabled={busy} className="btn-primary w-full py-3">
              {busy ? "Joining…" : "Join this circle"}
            </button>
          )
        ) : circle.status === "Completed" ? (
          <p className="text-center text-sm text-accent-200">
            This circle completed its full cycle — everyone was paid once.
          </p>
        ) : !isMember ? (
          <p className="text-center text-sm text-stone-500">
            You're not a member of this circle.
          </p>
        ) : iHaveContributed ? (
          <div className="text-center">
            <p className="text-sm text-stone-400">
              You've paid into this round. Waiting on the rest.
            </p>
            {roundStalled && (
              <button
                onClick={doReclaim}
                disabled={busy}
                className="btn-ghost mt-3 w-full py-2 text-sm"
              >
                {busy ? "Working…" : "This round has stalled — take back my contribution"}
              </button>
            )}
          </div>
        ) : (
          <button onClick={doContribute} disabled={busy} className="btn-primary w-full py-3">
            {busy ? "Paying in…" : `Pay in ${money(circle.contribution)}`}
          </button>
        )}
      </div>
    </div>
  );
}
