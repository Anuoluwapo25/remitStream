"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { track } from "@/lib/analytics";
import { useToast } from "./Toast";

// Floating feedback button — required for the pilot's user-feedback collection.
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { address } = useWallet();
  const toast = useToast();

  async function submit() {
    if (!rating) {
      toast.error("Please pick a star rating.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, message, role, address }),
      });
      if (!res.ok) throw new Error("bad status");
      track("feedback_submitted", { rating, role });
      toast.success("Thanks for the feedback!");
      setOpen(false);
      setRating(0);
      setMessage("");
      setRole("");
    } catch {
      toast.error("Couldn't send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary fixed bottom-5 right-5 z-40 rounded-full px-4 py-3 shadow-xl"
        aria-label="Give feedback"
      >
        💬 <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1090] grid place-items-end sm:place-items-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-md animate-fade-in p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">How's your experience?</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mb-4 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className={`text-3xl transition ${
                    n <= (hover || rating) ? "text-amber-400" : "text-slate-600"
                  }`}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
            </div>

            <label className="label">I am a…</label>
            <div className="mb-3 flex gap-2">
              {["Sender", "Recipient", "Just exploring"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    role === r
                      ? "border-brand-400/60 bg-brand-500/15 text-brand-100"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <label className="label" htmlFor="fb-msg">
              What worked, what didn't?
            </label>
            <textarea
              id="fb-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="input resize-none"
              placeholder="Tell us anything…"
            />

            <button
              onClick={submit}
              disabled={submitting}
              className="btn-primary mt-4 w-full"
            >
              {submitting ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
