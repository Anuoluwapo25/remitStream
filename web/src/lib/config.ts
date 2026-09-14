// Deployment configuration for the RemitStream contract suite.
//
// These default to the live testnet deployment recorded in the repo's
// deployments.json. They can be overridden per-environment with NEXT_PUBLIC_*
// vars so the same build can point at a fresh deployment without code changes.

const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";

export const config = {
  network,
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
  rpcUrl:
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl:
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  // A fresh wallet has no account on testnet until something creates one, and
  // no Soroban call — the faucet included — can be built without it. The app
  // creates it with friendbot rather than assuming the wallet offered to.
  // Empty on a network with no faucet, which turns the whole path off.
  friendbotUrl:
    process.env.NEXT_PUBLIC_FRIENDBOT_URL ??
    (network === "testnet" ? "https://friendbot.stellar.org" : ""),
  contracts: {
    token:
      process.env.NEXT_PUBLIC_TOKEN_ID ??
      "CD3TKICZQDPXPOYDFZW4JFHX5AT7VFK2VJZQE22Q4CYZQKYDVLW2ZFP2",
    vault:
      process.env.NEXT_PUBLIC_VAULT_ID ??
      "CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y",
    router:
      process.env.NEXT_PUBLIC_ROUTER_ID ??
      "CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L",
    // Unset until deployed — no hardcoded fallback, unlike the other three.
    // Claim links are a real, tested contract (see contracts/claim-link) that
    // just hasn't been pushed to testnet yet. The UI hides the feature
    // entirely rather than pointing at a contract that doesn't exist.
    claims: process.env.NEXT_PUBLIC_CLAIMS_ID ?? "",
    // Same story — see contracts/savings-circle.
    circles: process.env.NEXT_PUBLIC_CIRCLES_ID ?? "",
  },
  // Display code for the settlement asset.
  //
  // The router and vault take a token address at initialize and talk to it
  // through the standard token interface, so they work with any SEP-41 token —
  // including the Stellar Asset Contract wrapping real USDC. Nothing on-chain
  // is specific to rUSDC, and nothing in the UI should be either: point a
  // deployment at a different token and set this to match.
  assetCode: process.env.NEXT_PUBLIC_ASSET_CODE ?? "rUSDC",
  // The testnet token ships a faucet so pilot testers can get funds in one tap.
  // A real asset has no such thing, so the faucet UI hides itself.
  faucetEnabled: process.env.NEXT_PUBLIC_FAUCET_ENABLED !== "false",
  // True once a claim-link contract address is configured.
  get claimLinksEnabled() {
    return this.contracts.claims.length > 0;
  },
  // True once a savings-circle contract address is configured.
  get circlesEnabled() {
    return this.contracts.circles.length > 0;
  },
  explorerBase:
    process.env.NEXT_PUBLIC_EXPLORER_BASE ??
    "https://stellar.expert/explorer/testnet",
  // A funded public account used only as the source for read-only simulations.
  // No signing happens against it; it just satisfies the SDK's tx builder.
  readAccount:
    process.env.NEXT_PUBLIC_READ_ACCOUNT ??
    "GCM47IVZ6D3OUEV62TAZTOFD6OQHYJBFOM2POCFFVJACJF6L22RZCBPY",
} as const;

/** rUSDC uses 7 decimals, matching Stellar's native precision. */
export const DECIMALS = 7;
export const UNIT = 10_000_000n; // 10 ** 7

export function explorerContract(id: string): string {
  return `${config.explorerBase}/contract/${id}`;
}

export function explorerTx(hash: string): string {
  return `${config.explorerBase}/tx/${hash}`;
}

export function explorerAccount(address: string): string {
  return `${config.explorerBase}/account/${address}`;
}
