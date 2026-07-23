// Deployment configuration for the RemitStream contract suite.
//
// These default to the live testnet deployment recorded in the repo's
// deployments.json. They can be overridden per-environment with NEXT_PUBLIC_*
// vars so the same build can point at a fresh deployment without code changes.

export const config = {
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
  rpcUrl:
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl:
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
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
