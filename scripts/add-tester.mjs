#!/usr/bin/env node
//
// Adds one real tester's wallet address to pilot-users.json as a "pilot"
// participant, then regenerates docs/USER_PROOF.md so the count reflects
// live on-chain state.
//
// Usage: node scripts/add-tester.mjs GXXXXXXX... [label]

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PILOT_USERS = join(ROOT, "pilot-users.json");

const address = process.argv[2];
if (!address || !/^G[A-Z2-7]{55}$/.test(address)) {
  console.error("Usage: node scripts/add-tester.mjs <STELLAR_PUBLIC_KEY> [label]");
  console.error('Example: node scripts/add-tester.mjs GABCDEF...XYZ "jane"');
  process.exit(1);
}

const data = JSON.parse(readFileSync(PILOT_USERS, "utf8"));

const existing = data.participants.find((p) => p.address === address);
if (existing) {
  console.log(
    `Already tracked as "${existing.label}" (role: ${existing.role}). Nothing to do.`,
  );
  process.exit(0);
}

const pilotCount = data.participants.filter((p) => p.role === "pilot").length;
const label = process.argv[3] || `pilot-${pilotCount + 1}`;

data.participants.push({
  label,
  address,
  network: "testnet",
  role: "pilot",
});
data.generatedAt = new Date().toISOString();

writeFileSync(PILOT_USERS, JSON.stringify(data, null, 2) + "\n");
console.log(`Added ${address} as "${label}". Pilot testers: ${pilotCount + 1}.`);

console.log("Regenerating docs/USER_PROOF.md from chain state...");
try {
  execFileSync("node", ["scripts/proof.mjs"], { cwd: ROOT, stdio: "inherit" });
} catch (err) {
  console.error(
    "\nproof.mjs failed — the address is saved in pilot-users.json, but",
    "USER_PROOF.md was not regenerated. Re-run `node scripts/proof.mjs`",
    "once the tester has actually completed a transaction on-chain.",
  );
  process.exit(1);
}
