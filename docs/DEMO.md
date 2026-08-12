# Demo script

A ~3.5 minute walkthrough covering the full product. Timings are a guide, not a
script to read aloud verbatim.

## Before you record

```bash
# 1. Contracts are live (or redeploy your own)
cat deployments.json

# 2. App running
cd web && npm run dev

# 3. Two wallets in your browser wallet extension:
#    - "Sender"    — funded with rUSDC via the in-app faucet
#    - "Recipient" — will receive and auto-save
```

Have the recipient's address copied to your clipboard before you start.

---

## 0:00 — The problem (20s)

> "Migrant workers lose 6 to 8 percent of every remittance to fees, and wait
> days for it to land. And when it does land, it gets spent immediately —
> because the person receiving it usually has no way to save any of it.
>
> RemitStream fixes both halves of that."

Show the landing page. Point at the three steps along the bottom.

Then, in a fresh browser profile, show the welcome guide that greets a first-time
visitor and the getting-started checklist beside the send panel.

> "Testers said it wasn't obvious what to do first, especially for anyone new to
> Web3. The checklist reads its progress off the chain, so it knows what you've
> actually done."

## 0:20 — Recipient sets a savings rule (30s)

Switch to the **Recipient** wallet → **Dashboard**.

> "The recipient decides once how much of every incoming transfer gets saved.
> Here I'll set 20%."

- Drag the slider to 20%, hit **Update rule**, approve in the wallet.
- Call out: *"That's the recipient's own signature. The person sending money
  can't change how much you save — that's yours to control."*

## 0:50 — Sender sends money (45s)

Switch to the **Sender** wallet → **Send**.

- Claim faucet funds if needed (**Get test rUSDC**).
- Paste the recipient's address, type `100`.

> "Before I confirm anything, the app quotes the split straight from the
> contract — 80 goes to their wallet to spend, 20 goes into their savings vault."

Point at the live split preview bar as it updates.

- Hit **Send remittance**, approve **one** wallet prompt.

> "One signature, one transaction, about five seconds."

Show the success card with the 80/20 breakdown, then point at the explorer link
on it.

> "And there's the transaction on Stellar. Every confirmation carries its own
> receipt — pilot users had to go digging in their wallet extension for this, so
> now the app hands it to you."

Click it, show the transaction on stellar.expert, come back.

## 1:35 — What the recipient sees (35s)

Switch back to the **Recipient** wallet → **Dashboard**.

- Wallet balance is up 80. Savings vault is up 20.
- Lifetime stats now show 1 remittance, 100 received, 20 auto-saved.

> "The split happened inside the transfer. There was no second step, no separate
> savings app, nothing for the recipient to remember to do."

## 2:10 — Transaction history (25s)

Go to **History**.

> "Every transfer, withdrawal and rule change, read straight off the ledger —
> there's no database behind this. Money you sent comes from your account's own
> signed history; money you received comes from the router's settlement events,
> because an incoming transfer never touches the recipient's account record."

Point at a row's explorer link, and at the filter tabs.

## 2:35 — Yield (25s)

Run this in a terminal on camera (or pre-run it and refresh):

```bash
# Admin distributes yield across all vault depositors
stellar contract invoke --id <VAULT_ID> \
  --source-account remitstream-admin --network testnet \
  -- accrue_yield --amount 500000000
```

Refresh the dashboard — the savings balance has grown.

> "Yield is distributed by raising the vault's total assets without minting new
> shares, so everyone's balance grows proportionally. Deposits made after this
> point buy in at the higher price, so nobody gets diluted."

Then withdraw: enter an amount → **Withdraw**.

> "And it's liquid — they can pull it out any time, yield included."

## 3:00 — Production quality (25s)

Go to **Insights**.

> "This is the pilot's live analytics — and the money figures here are counted
> from the router's own settlement events and read out of the vault contract, not
> from an app database. A tester told us this page looked hardcoded, and they were
> right: it used to read a file that reset on every deploy."

Let the "updated Ns ago" stamp tick over on camera.

Show the mobile view (device toolbar or a real phone).

> "And it's fully responsive, because the people who need this are on phones."

## 3:25 — Close (15s)

> "Contracts are deployed on Stellar testnet with 43 tests covering the
> money-movement paths. Next up is SEP-24 anchors for real fiat on and off
> ramps, path payments for cross-currency settlement, and routing the vault
> into a live DeFi yield source.
>
> That's RemitStream — remittances that leave something behind."

---

## Shot list

If you'd rather cut it together than record live:

| # | Shot | Duration |
|---|---|---|
| 1 | Landing page + first-run welcome guide and checklist | 0:20 |
| 2 | Dashboard: slider 0% → 20%, wallet approve | 0:30 |
| 3 | Send: type amount, split preview updating live | 0:25 |
| 4 | Wallet approval prompt + success card with explorer link | 0:20 |
| 5 | Recipient dashboard: balances and stats updated | 0:35 |
| 6 | History page: filters and a transaction link | 0:25 |
| 7 | Terminal: `accrue_yield` + refreshed balance | 0:25 |
| 8 | Withdraw flow | 0:10 |
| 9 | Insights dashboard, live figures | 0:15 |
| 10 | Mobile view | 0:10 |

## Things worth saying out loud

Reviewers look for depth. These land well:

- **"One signature."** The router pulls once and fans out, so the auth tree
  stays shallow and the user sees a single prompt.
- **"The vault verifies its own funding."** `credit()` re-checks the vault's
  real token balance, so a compromised router can't mint shares from nothing.
- **"Rounding always favours solvency."** Withdrawal burn rounds up; the split
  never strands a residue in the router.
- **"There is no database."** History and analytics are reconciled from Horizon
  and contract events, so nothing the app shows can drift from the chain.
- **"The preview and the execution share one code path."** `quote()` and
  `route()` compute the split identically, and a test asserts they agree.
