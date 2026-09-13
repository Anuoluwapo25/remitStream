"use client";

// Tab switcher between the two ways to send: to a known wallet address, or
// as a claim link for someone who doesn't have one yet. Renders just the
// address-based SendPanel, unchanged, when claim links aren't deployed on
// this environment — see config.claimLinksEnabled.

import { useState } from "react";
import { config } from "@/lib/config";
import { SendPanel } from "./SendPanel";
import { ClaimLinkPanel } from "./ClaimLinkPanel";

export function SendTabs() {
  const [tab, setTab] = useState<"address" | "link">("address");

  if (!config.claimLinksEnabled) return <SendPanel />;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
        <button
          onClick={() => setTab("address")}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            tab === "address" ? "bg-white/10 text-white" : "text-stone-400 hover:text-white"
          }`}
        >
          To a wallet
        </button>
        <button
          onClick={() => setTab("link")}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            tab === "link" ? "bg-white/10 text-white" : "text-stone-400 hover:text-white"
          }`}
        >
          As a claim link
        </button>
      </div>
      {tab === "address" ? <SendPanel /> : <ClaimLinkPanel />}
    </div>
  );
}
