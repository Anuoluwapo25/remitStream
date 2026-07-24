# Architecture

## Contents

- [System overview](#system-overview)
- [Contract design](#contract-design)
- [Money flow, step by step](#money-flow-step-by-step)
- [Security properties](#security-properties)
- [Frontend architecture](#frontend-architecture)
- [Analytics & monitoring](#analytics--monitoring)
- [Known limitations](#known-limitations)

---

## System overview

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js app (App Router, React 19)                          │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Send flow  │  │ Recipient    │  │ Insights             │  │
│  │ + live     │  │ dashboard    │  │ analytics/monitoring │  │
│  │ split quote│  │ rule·yield   │  │ feedback             │  │
│  └─────┬──────┘  └──────┬───────┘  └──────────┬───────────┘  │
│        │  Stellar Wallets Kit (signs)         │ /api/*       │
└────────┼────────────────┼─────────────────────┼──────────────┘
         │                │                     │
         ▼                ▼                     ▼
┌────────────────────────────────────┐   ┌──────────────┐
│  Soroban (Stellar testnet)         │   │ NDJSON store │
│                                    │   │ events       │
│  AutoSplitRouter ──▶ SavingsVault  │   │ errors       │
│         │                  │       │   │ feedback     │
│         └──────┬───────────┘       │   └──────────────┘
│                ▼                   │
│           rUSDC (SEP-41)           │
└────────────────────────────────────┘
```

---

## Contract design

### `remit-token` — rUSDC (SEP-41)

A standard fungible token with two deliberate deviations for the pilot:

1. **Pure Soroban balances, not a classic asset.** Using classic USDC on testnet
   would force every pilot user to establish a trustline before they could
   receive anything — a hard stop during onboarding. Contract-storage balances
   let any address receive funds on first contact.
2. **A rate-limited faucet.** `faucet()` mints 1,000 rUSDC per address with a
   ~6-hour cooldown tracked in temporary storage, so pilot users self-serve
   instead of queueing behind an admin mint.

On mainnet this contract is replaced by real USDC; nothing else changes, because
the vault and router only depend on the SEP-41 interface.

### `savings-vault` — share-based savings

The vault tracks `total_assets` and `total_shares`. A deposit mints

```
shares = amount × total_shares / total_assets
```

Yield is distributed by **increasing `total_assets` without minting shares**, so
the value of every existing share rises proportionally.

This matters for correctness. A naive "add interest to each balance" loop is
O(users) and unbounded; the share model is O(1) and has two useful properties:

- **No dilution.** A deposit made *after* yield accrues buys in at the higher
  share price, so it can't skim earlier depositors' yield.
- **Fair exit.** Withdrawing burns shares at the current price, so a user
  always takes exactly their proportional stake.

Two funding paths exist:

| Method | Caller | Purpose |
|---|---|---|
| `deposit(from, beneficiary, amount)` | anyone | Pulls tokens from `from`, credits `beneficiary`. Lets a sender fund someone else's savings. |
| `credit(beneficiary, amount)` | router only | Credits shares for tokens the router **already** transferred in. |

`credit` is the interesting one — see [Security properties](#security-properties).

### `auto-split-router` — the product logic

Holds a per-recipient `Rule { save_bps, enabled }` and, on every `route()` call:

1. pulls the full amount from the sender,
2. forwards `payout` to the recipient's wallet,
3. transfers `saved` into the vault and calls `credit()` to mint the shares,
4. updates the recipient's lifetime `Stats`.

`quote()` exposes the same split calculation as a pure read, so the UI can show
the breakdown before the user signs anything — the preview and the execution
share one code path, and a test asserts they agree.

---

## Money flow, step by step

Sending 100 rUSDC to a recipient whose rule is 20%:

```
1. sender signs one transaction: route(sender, recipient, 100)

2. router: token.transfer(sender → router, 100)        ← full amount in
3. router: token.transfer(router → recipient, 80)      ← spendable
4. router: token.transfer(router → vault, 20)          ← savings
5. router: vault.credit(recipient, 20)
6.   vault: assert(vault.balance ≥ accounted + 20)     ← independent check
7.   vault: mint 20 × shares/assets shares to recipient
8. router: stats[recipient] += { received:100, saved:20, transfers:1 }

result: Split { payout: 80, saved: 20 }   router balance: 0
```

**One signature.** The sender is the transaction source, so `require_auth()` on
`sender` is satisfied by the transaction signature itself — no separate
authorization entries to sign. This keeps the flow to a single wallet prompt,
which matters a lot for non-crypto-native users.

---

## Security properties

Each of these is enforced in the contract and covered by a test.

### The recipient owns their savings rule

`set_rule` calls `recipient.require_auth()`. A sender can route money to someone
but can never change how much that person saves. This is the whole trust model
of the product: savings behaviour belongs to the person doing the saving.

### The vault does not trust the router

`credit()` is the only privileged entry point, and even it is verified:

```rust
let on_chain = token.balance(&vault_address);
if on_chain < assets_before + amount {
    panic_with_error!(&env, Error::FundsNotReceived);
}
```

The vault re-derives ground truth from the token contract rather than believing
the router's claim. A compromised or buggy router cannot mint shares against
funds that never arrived — the worst it can do is donate tokens.

### Rounding never leaks value

- **Withdrawals** round the share burn *up*
  (`(amount × shares + assets − 1) / assets`), so dust always favours the vault.
  A test asserts the vault's real token balance stays ≥ its accounted assets
  after a withdrawal at a non-round share price.
- **Splits** truncate `saved` downward, favouring the recipient's immediate
  payout, and `payout` is computed as `amount − saved` rather than independently.
  This makes `payout + saved == amount` true by construction, so the router can
  never strand a residue. A test checks the router's balance is exactly zero
  after an awkward split (33.33% of 101).

### Failure modes are explicit

Every rejection path returns a typed error rather than an opaque panic, and the
frontend maps each to a sentence a user can act on:

| Error | What the user sees |
|---|---|
| `FaucetCooldown` | "You've already claimed recently. Try again in a few hours." |
| `InsufficientBalance` | "Not enough rUSDC for this amount." |
| `SelfTransfer` | "You can't send a remittance to yourself." |
| `InvalidSplit` | "Savings rate must be between 0% and 100%." |

---

## Frontend architecture

```
src/
├── bindings/        generated typed clients (token, vault, router)
├── lib/
│   ├── config.ts    deployment addresses, env-overridable
│   ├── contracts.ts client factories + humanizeError
│   ├── reads.ts     read-only simulations (no wallet needed)
│   ├── actions.ts   signed, submitted calls
│   ├── wallet.tsx   Stellar Wallets Kit provider
│   ├── hooks.ts     useAccountData, useVaultTotals
│   └── analytics.ts first-party tracking + error reporting
├── components/      UI, incl. ErrorBoundary and Toast
└── app/             routes + /api handlers
```

**Reads and writes are separated deliberately.** `reads.ts` runs simulations
against a public source account, so balances, quotes, and vault totals render
before a wallet is connected — the app is useful on first paint instead of
gating everything behind a connect button.

**Contract bindings are vendored, not packaged.** `stellar contract bindings
typescript` emits standalone npm packages; each would need its own install and
`tsc` build. Since they're single self-contained files, they're copied into
`src/bindings` and compiled by Next directly. Regenerate them after any contract
ABI change.

---

## Analytics & monitoring

Three first-party collectors write to an append-only NDJSON store:

| Route | Records |
|---|---|
| `POST /api/track` | product events (`remittance_sent`, `rule_updated`, `faucet_claimed`, `wallet_connected`) |
| `POST /api/monitor` | client errors, from the error boundary and caught async failures |
| `POST /api/feedback` | in-app rating + comment |

`GET /api/insights` aggregates them into the figures on `/insights`: volume,
save rate, adoption, 7-day trend, error counts, and satisfaction.

A `remittance_sent` event is only emitted **after** the on-chain call resolves,
so the volume figures reflect settled transactions rather than attempts.

The store is intentionally swappable — moving to Postgres or a hosted KV means
reimplementing `append`/`readAll` in `lib/store.ts` and nothing else. On an
ephemeral serverless filesystem, do that before relying on retention.

---

## Known limitations

Honest accounting of what this MVP does not yet do:

1. **Yield is admin-funded, not protocol-generated.** `accrue_yield` transfers
   real tokens from the admin and redistributes them correctly, but the yield
   source is manual. Integrating a lending protocol (e.g. Blend) is the next
   step; the vault's share accounting already supports it without changes.
2. **No SEP-24 anchors yet.** Fiat on/off-ramp is the missing half of a real
   remittance corridor. The current flow starts and ends in rUSDC.
3. **No path payments.** Both sides transact in the same asset. Cross-currency
   atomic settlement — arguably Stellar's signature feature — is designed for
   but not implemented.
4. **Single-asset vault.** One token per deployment.
5. **Estimated yield display.** The dashboard shows
   `savings − lifetime_auto_saved`, which understates yield for a user who has
   withdrawn before. It's labelled "est." for that reason; exact per-user yield
   needs withdrawal tracking.
