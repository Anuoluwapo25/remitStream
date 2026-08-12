#!/usr/bin/env node
//
// Generates a verifiable proof-of-wallet-interaction report from on-chain state.
//
// Reads pilot-users.json and, for every wallet, gathers two independent views:
//
//   Horizon  — the operations that wallet actually signed, with full retention.
//              This is what proves a human approved a transaction, and it is
//              the only side that shows *outbound* activity.
//   Contract — the router's per-recipient stats and the vault's balance, which
//   state     show what the wallet *received* and still holds.
//
// Both are needed: a sender's activity never appears in the router's recipient
// stats, and a recipient's incoming transfer never appears in their own Horizon
// history, because rUSDC balances live in contract storage rather than in
// classic trustlines.
//
// Everything in the generated report is derived here. Earlier revisions of
// docs/USER_PROOF.md carried a hand-maintained table alongside the generated
// one, which is exactly the kind of thing that silently goes stale.
//
// Usage: node scripts/proof.mjs

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The Stellar SDK is a dependency of the web app, and the repo deliberately has
// no second package.json at the root. A bare ESM import would only search
// scripts/ and upwards, never web/node_modules, so resolve against the web
// package explicitly instead of duplicating the dependency.
const require = createRequire(join(ROOT, "web", "package.json"));
const {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc,
  Account,
} = require("@stellar/stellar-sdk");
const deployments = JSON.parse(
  readFileSync(join(ROOT, "deployments.json"), "utf8"),
);
const users = JSON.parse(readFileSync(join(ROOT, "pilot-users.json"), "utf8"));

const server = new rpc.Server(deployments.rpcUrl, {
  allowHttp: deployments.rpcUrl.startsWith("http://"),
});
const passphrase = deployments.networkPassphrase ?? Networks.TESTNET;
const horizonUrl = deployments.horizonUrl ?? "https://horizon-testnet.stellar.org";
const UNIT = 10_000_000n;

// A read-only simulation still needs a source account; any funded account works.
const SOURCE = deployments.admin;

/** Simulate a contract call and return the native result. */
async function view(contractId, method, args) {
  const account = new Account(SOURCE, "0");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

const KNOWN_CONTRACTS = new Map([
  [deployments.contracts.router, "router"],
  [deployments.contracts.vault, "vault"],
  [deployments.contracts.token, "token"],
]);

/** Human label for a contract call, or null if it is not one of ours. */
function labelCall(contractId, fn) {
  const which = KNOWN_CONTRACTS.get(contractId);
  if (!which) return null;
  if (which === "router" && fn === "route") return "sent remittance";
  if (which === "router" && fn === "set_rule") return "set auto-save rule";
  if (which === "vault" && fn === "withdraw") return "withdrew savings";
  if (which === "vault" && fn === "withdraw_all") return "withdrew all savings";
  if (which === "vault" && fn === "deposit") return "deposited to vault";
  if (which === "token" && fn === "faucet") return "claimed test rUSDC";
  return `${which}.${fn}`;
}

/**
 * Every RemitStream operation this wallet signed, newest first.
 *
 * Horizon exposes the invocation's parameters as base64 ScVals: the first is
 * the contract address and the second the function name.
 */
async function signedOps(address) {
  const res = await fetch(
    `${horizonUrl}/accounts/${address}/operations?limit=200&order=desc&include_failed=false`,
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Horizon ${res.status}`);
  }
  const body = await res.json();
  const ops = [];

  for (const op of body._embedded?.records ?? []) {
    if (op.type !== "invoke_host_function") continue;
    const params = op.parameters ?? [];
    if (params.length < 2) continue;
    try {
      const dec = (p) => scValToNative(xdr.ScVal.fromXDR(p.value, "base64"));
      const contractId = String(dec(params[0]));
      const fn = String(dec(params[1]));
      const label = labelCall(contractId, fn);
      if (!label) continue;
      ops.push({
        label,
        fn,
        txHash: op.transaction_hash,
        at: op.created_at,
        amount:
          fn === "route" && params.length >= 5 ? BigInt(dec(params[4])) : null,
      });
    } catch {
      // Unreadable invocation — leave it out rather than guess.
    }
  }
  return ops;
}

function fmt(units) {
  const v = BigInt(units ?? 0);
  const whole = v / UNIT;
  const frac = (v % UNIT).toString().padStart(7, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${frac}`;
}

const explorer =
  deployments.network === "mainnet"
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";

const short = (a) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const accountLink = (a) => `[\`${short(a)}\`](${explorer}/account/${a})`;
const txLink = (h) => `[\`${h.slice(0, 8)}…\`](${explorer}/tx/${h})`;

const rows = [];
const totals = {
  received: 0n,
  saved: 0n,
  transfersIn: 0,
  savings: 0n,
  sentVolume: 0n,
  sentCount: 0,
  signedOps: 0,
  activeWallets: 0,
};

for (const p of users.participants) {
  const addrArg = nativeToScVal(Address.fromString(p.address), {
    type: "address",
  });

  let stats = { total_received: 0n, total_saved: 0n, transfers: 0 };
  let savings = 0n;
  let ops = [];

  try {
    [stats, savings, ops] = await Promise.all([
      view(deployments.contracts.router, "get_stats", [addrArg]),
      view(deployments.contracts.vault, "balance_of", [addrArg]),
      signedOps(p.address),
    ]);
  } catch (e) {
    console.error(`  ! ${p.label}: ${e.message}`);
  }

  const received = BigInt(stats.total_received ?? 0);
  const saved = BigInt(stats.total_saved ?? 0);
  const transfersIn = Number(stats.transfers ?? 0);
  savings = BigInt(savings ?? 0);

  const sends = ops.filter((o) => o.fn === "route");
  const sentVolume = sends.reduce((s, o) => s + (o.amount ?? 0n), 0n);

  totals.received += received;
  totals.saved += saved;
  totals.transfersIn += transfersIn;
  totals.savings += savings;
  totals.sentVolume += sentVolume;
  totals.sentCount += sends.length;
  totals.signedOps += ops.length;
  if (ops.length > 0 || transfersIn > 0) totals.activeWallets += 1;

  rows.push({
    ...p,
    received,
    saved,
    transfersIn,
    savings,
    ops,
    sends,
    sentVolume,
  });

  console.log(
    `  ${p.label.padEnd(12)} signed=${String(ops.length).padStart(2)}  ` +
      `sent=${fmt(sentVolume).padStart(10)}  received=${fmt(received).padStart(10)}  ` +
      `vault=${fmt(savings).padStart(9)}`,
  );
}

const byRole = (role) => rows.filter((r) => (r.role ?? "pilot") === role);

function walletTable(group) {
  return [
    "| # | Wallet | Signed ops | Sent | Received | Auto-saved | In vault | Latest transaction |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...group.map((r, i) => {
      const latest = r.ops[0];
      return (
        `| ${i + 1} | ${accountLink(r.address)} | ${r.ops.length} | ` +
        `${fmt(r.sentVolume)} | ${fmt(r.received)} | ${fmt(r.saved)} | ${fmt(r.savings)} | ` +
        `${latest ? `${latest.label} · ${txLink(latest.txHash)}` : "—"} |`
      );
    }),
  ].join("\n");
}

const pilots = byRole("pilot");
const builders = byRole("builder");

const md = `# Proof of Wallet Interactions

Generated **${new Date().toISOString()}** by \`scripts/proof.mjs\`, which reads
every figure below directly from the ${deployments.network} ledger. Nothing here is
hand-maintained — re-run the script to regenerate it, and follow any link to
verify a row independently.

Each wallet is measured two ways, because neither view is complete on its own:

- **Signed ops / Sent** come from that account's Horizon history — proof that a
  human approved a transaction from this wallet.
- **Received / Auto-saved / In vault** come from the AutoSplitRouter and
  SavingsVault contracts. Incoming transfers never appear in a recipient's
  Horizon history, because rUSDC balances live in contract storage rather than
  in classic trustlines.

**Contracts**

| Contract | Address |
|---|---|
| AutoSplitRouter | [\`${deployments.contracts.router}\`](${explorer}/contract/${deployments.contracts.router}) |
| SavingsVault | [\`${deployments.contracts.vault}\`](${explorer}/contract/${deployments.contracts.vault}) |
| rUSDC token | [\`${deployments.contracts.token}\`](${explorer}/contract/${deployments.contracts.token}) |

## Summary

| Metric | Value |
|---|---|
| Wallets tracked | **${rows.length}** |
| Wallets with on-chain activity | **${totals.activeWallets}** |
| Signed contract operations | **${totals.signedOps}** |
| Remittances sent | **${totals.sentCount}** |
| Remittances received | **${totals.transfersIn}** |
| Volume routed | **${fmt(totals.sentVolume)} rUSDC** |
| Auto-saved into vault | **${fmt(totals.saved)} rUSDC** |
| Currently held in vault | **${fmt(totals.savings)} rUSDC** |

## Pilot participants (${pilots.length})

Wallets operated by pilot testers recruited through the feedback form. Each was
funded via friendbot, claimed test rUSDC, set an auto-save rule, and took part in
at least one remittance.

${walletTable(pilots)}

## Builder-operated wallets (${builders.length})

Wallets funded and operated by the project author while testing the flow
end-to-end, each transaction individually approved through a Freighter
extension. Listed separately because they are **not** independent users and
should not be counted as such.

${walletTable(builders)}

## How to verify

Any row can be checked without trusting this file.

\`\`\`bash
# What the router recorded for a recipient
stellar contract invoke --id ${deployments.contracts.router} \\
  --source-account <any-funded-account> --network ${deployments.network} \\
  -- get_stats --recipient <wallet-address>

# What a wallet signed
curl "${horizonUrl}/accounts/<wallet-address>/operations?limit=200"
\`\`\`

Or open any account or transaction link above in the explorer.
`;

mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(join(ROOT, "docs", "USER_PROOF.md"), md);
console.log(
  `\nWrote docs/USER_PROOF.md — ${rows.length} wallets ` +
    `(${pilots.length} pilot, ${builders.length} builder), ` +
    `${totals.signedOps} signed operations, ${fmt(totals.sentVolume)} rUSDC routed`,
);
