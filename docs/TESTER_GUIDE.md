# Try RemitStream — 2 minutes

Thanks for helping test this. You're sending a real transaction on Stellar's
public testnet — it costs nothing, but it's not a simulation, and it's what
lets us prove real people used the app.

## What you need

- A browser wallet: [Freighter](https://www.freighter.app/) is easiest (2-minute
  install). xBull, Albedo and Lobstr also work.
- Set the wallet to **Testnet** (Freighter: Settings → Network → Testnet).

## Steps

1. Go to **https://remit-stream.vercel.app/** and click **Connect Wallet**.
2. Click **Get test rUSDC** to claim funds from the in-app faucet. No trustline
   setup needed. On a brand-new wallet the first tap also creates your testnet
   account, so it takes a few seconds longer — the button says so while it
   works.
3. Open **Dashboard** and set a savings rule — try 20%. Approve it in your
   wallet.
4. Go to **Send**, paste any other testnet address as the recipient (ask
   whoever invited you for theirs, or use a second wallet/browser profile
   yourself), enter an amount, and hit **Send remittance**. One approval in
   your wallet.
5. Check **History** — your transaction should show up with a link to
   [stellar.expert](https://stellar.expert/explorer/testnet).

That's it — you've completed one full remittance loop.

## One more thing

Reply with your **public wallet address** (starts with `G…`, never share your
secret key) and, if you have 30 seconds, what confused you or what you'd want
changed. Real feedback from real testers has driven most of what's shipped —
see [the README](../README.md#what-pilot-users-asked-for) for examples. Your
address gets added to [`pilot-users.json`](../pilot-users.json) as a counted
pilot participant, verifiable on-chain via
[`docs/USER_PROOF.md`](USER_PROOF.md).
