"use client";

// The recipient's savings, reframed as goals instead of one flat percentage.
//
// Each goal claims a slice (in basis points) of every incoming remittance until
// it reaches its target. A full goal's slice cascades to the next goal in
// priority order; whatever no goal claims is spendable. All of this is enforced
// in the auto-split-router contract — this component only reads and edits it.

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import type { Goal } from "@/lib/reads";
import {
  addGoal,
  archiveGoal,
  reorderGoals,
  setGoalAllocation,
  updateGoal,
} from "@/lib/actions";
import { humanizeError } from "@/lib/contracts";
import { config } from "@/lib/config";
import { fromBaseUnits, money, toBaseUnits } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useToast } from "./Toast";
import { SectionTitle, Skeleton } from "./ui";

const MAX_GOALS = 8;

function pct(bps: number): string {
  return `${(bps / 100).toString().replace(/\.0$/, "")}%`;
}

function daysLeft(deadline: number): string | null {
  if (!deadline) return null;
  const ms = deadline * 1000 - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days < 0) return "past due";
  if (days === 0) return "due today";
  if (days === 1) return "1 day left";
  if (days < 45) return `${days} days left`;
  const months = Math.round(days / 30);
  return `${months} months left`;
}

function dateToUnix(value: string): number {
  if (!value) return 0;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

function unixToDate(unix: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function GoalsBoard({
  goals,
  loading,
  onChange,
}: {
  goals: Goal[];
  loading: boolean;
  onChange: () => void;
}) {
  const visible = useMemo(
    () => goals.filter((g) => g.status !== "Archived"),
    [goals],
  );
  const totalBps = visible
    .filter((g) => g.status === "Active")
    .reduce((sum, g) => sum + g.allocationBps, 0);
  const spendableBps = Math.max(0, 10_000 - totalBps);

  return (
    <div className="card p-5">
      <SectionTitle hint={`${pct(spendableBps)} stays spendable`}>
        Savings goals
      </SectionTitle>
      <p className="mb-4 text-sm text-stone-400">
        Give each goal a slice of every transfer you receive. Fill one and its
        slice rolls to the next. Everything left lands in your wallet.
      </p>

      {loading && visible.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((goal, i) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              index={i}
              count={visible.length}
              order={visible.map((g) => g.id)}
              siblingBps={totalBps - goal.allocationBps}
              onChange={onChange}
            />
          ))}
          {visible.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-stone-400">
              No goals yet. Add one below and your next transfer starts filling
              it.
            </p>
          )}
        </div>
      )}

      {visible.length < MAX_GOALS && (
        <NewGoalForm
          spendableBps={spendableBps}
          onCreated={onChange}
        />
      )}
    </div>
  );
}

function GoalCard({
  goal,
  index,
  count,
  order,
  siblingBps,
  onChange,
}: {
  goal: Goal;
  index: number;
  count: number;
  order: number[];
  siblingBps: number;
  onChange: () => void;
}) {
  const { signer } = useWallet();
  const toast = useToast();
  const [bps, setBps] = useState(goal.allocationBps);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => setBps(goal.allocationBps), [goal.allocationBps]);

  const maxBps = 10_000 - siblingBps;
  const targeted = goal.target > 0n;
  const progress = targeted
    ? Math.min(100, Number((goal.saved * 100n) / goal.target))
    : 0;
  const dl = daysLeft(goal.deadline);
  const reached = goal.status === "Reached";

  async function commitAllocation() {
    if (!signer || bps === goal.allocationBps) return;
    setBusy(true);
    try {
      const { txHash } = await setGoalAllocation(signer, goal.id, bps);
      track("goal_allocation_set", { goal_id: goal.id, bps, txHash });
      toast.success(`${goal.name}: ${pct(bps)} of each transfer`, txHash);
      onChange();
    } catch (e) {
      toast.error(humanizeError(e));
      setBps(goal.allocationBps);
    } finally {
      setBusy(false);
    }
  }

  async function move(dir: -1 | 1) {
    if (!signer) return;
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setBusy(true);
    try {
      const { txHash } = await reorderGoals(signer, next);
      track("goals_reordered", { txHash });
      toast.success("Priority updated", txHash);
      onChange();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!signer) return;
    setBusy(true);
    try {
      const { txHash } = await archiveGoal(signer, goal.id);
      track("goal_archived", { goal_id: goal.id, txHash });
      toast.success(`Archived "${goal.name}"`, txHash);
      onChange();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{goal.name}</span>
            {reached && (
              <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[11px] font-medium text-accent-300">
                reached
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-stone-400">
            {targeted ? (
              <>
                {money(goal.saved)} of {money(goal.target)}
                {dl ? ` · ${dl}` : ""}
              </>
            ) : (
              <>Open-ended · {money(goal.saved)} saved{dl ? ` · ${dl}` : ""}</>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-1">
          <button
            onClick={() => move(-1)}
            disabled={busy || index === 0}
            className="rounded-md px-1.5 py-1 text-stone-500 hover:bg-white/10 hover:text-stone-200 disabled:opacity-30"
            aria-label="Higher priority"
          >
            ↑
          </button>
          <button
            onClick={() => move(1)}
            disabled={busy || index === count - 1}
            className="rounded-md px-1.5 py-1 text-stone-500 hover:bg-white/10 hover:text-stone-200 disabled:opacity-30"
            aria-label="Lower priority"
          >
            ↓
          </button>
        </div>
      </div>

      {targeted && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-accent-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={maxBps}
          step={500}
          value={Math.min(bps, maxBps)}
          onChange={(e) => setBps(Number(e.target.value))}
          onPointerUp={commitAllocation}
          onKeyUp={commitAllocation}
          disabled={busy || !signer}
          className="w-full accent-brand-500"
        />
        <span className="w-14 flex-none text-right text-sm font-semibold tabular-nums text-brand-300">
          {pct(bps)}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-stone-500">
        Slice of every transfer aimed here
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-white/10 pt-2 text-xs">
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-stone-400 hover:text-white"
        >
          {editing ? "Close" : "Edit"}
        </button>
        <button
          onClick={archive}
          disabled={busy}
          className="text-stone-500 hover:text-flag-300"
        >
          Archive
        </button>
      </div>

      {editing && (
        <GoalEditForm
          goal={goal}
          maxBps={maxBps}
          onSaved={() => {
            setEditing(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function GoalEditForm({
  goal,
  maxBps,
  onSaved,
}: {
  goal: Goal;
  maxBps: number;
  onSaved: () => void;
}) {
  const { signer } = useWallet();
  const toast = useToast();
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(
    goal.target > 0n ? fromBaseUnits(goal.target, { grouped: false }) : "",
  );
  const [deadline, setDeadline] = useState(unixToDate(goal.deadline));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!signer) return;
    setBusy(true);
    try {
      const { txHash } = await updateGoal(signer, goal.id, {
        name: name.trim(),
        target: target ? toBaseUnits(target) : 0n,
        deadline: dateToUnix(deadline),
        allocationBps: Math.min(goal.allocationBps, maxBps),
      });
      track("goal_updated", { goal_id: goal.id, txHash });
      toast.success(`Updated "${name.trim()}"`, txHash);
      onSaved();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div>
        <label className="label">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 48))}
          className="input text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Target ({config.assetCode})</label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="none"
            className="input text-sm"
          />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="input text-sm"
          />
        </div>
      </div>
      <button
        onClick={save}
        disabled={busy || !name.trim()}
        className="btn-primary w-full py-2 text-sm"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function NewGoalForm({
  spendableBps,
  onCreated,
}: {
  spendableBps: number;
  onCreated: () => void;
}) {
  const { signer } = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [bps, setBps] = useState(Math.min(2_000, spendableBps));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBps((b) => Math.min(b, spendableBps));
  }, [spendableBps]);

  async function create() {
    if (!signer || !name.trim()) return;
    setBusy(true);
    try {
      const { txHash } = await addGoal(signer, {
        name: name.trim(),
        target: target ? toBaseUnits(target) : 0n,
        deadline: dateToUnix(deadline),
        allocationBps: bps,
      });
      track("goal_created", { bps, targeted: !!target, txHash });
      toast.success(`Goal "${name.trim()}" created`, txHash);
      setName("");
      setTarget("");
      setDeadline("");
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={spendableBps === 0}
        className="btn-ghost mt-4 w-full py-2.5 text-sm disabled:opacity-40"
      >
        {spendableBps === 0
          ? "Every percent is allocated — archive a goal to add another"
          : "+ New goal"}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-brand-400/30 bg-brand-500/5 p-4">
      <div>
        <label className="label">What are you saving for?</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 48))}
          placeholder="School fees"
          className="input text-sm"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Target ({config.assetCode})</label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="optional"
            className="input text-sm"
          />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="input text-sm"
          />
        </div>
      </div>
      <div>
        <label className="label">
          Slice of each transfer — {pct(bps)}
        </label>
        <input
          type="range"
          min={0}
          max={spendableBps}
          step={500}
          value={bps}
          onChange={(e) => setBps(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="btn-primary flex-1 py-2 text-sm"
        >
          {busy ? "Creating…" : "Create goal"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="btn-ghost px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
