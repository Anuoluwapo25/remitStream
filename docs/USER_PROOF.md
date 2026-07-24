# Proof of Wallet Interactions

Generated **2026-07-24T08:36:17.872Z** by `scripts/proof.mjs`, which reads
this data directly from the testnet ledger — every figure below can be
independently verified with the explorer links.

**Contracts**

| Contract | Address |
|---|---|
| AutoSplitRouter | [`CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L`](https://stellar.expert/explorer/testnet/contract/CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L) |
| SavingsVault | [`CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y`](https://stellar.expert/explorer/testnet/contract/CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y) |
| rUSDC token | [`CD3TKICZQDPXPOYDFZW4JFHX5AT7VFK2VJZQE22Q4CYZQKYDVLW2ZFP2`](https://stellar.expert/explorer/testnet/contract/CD3TKICZQDPXPOYDFZW4JFHX5AT7VFK2VJZQE22Q4CYZQKYDVLW2ZFP2) |

## Summary

| Metric | Value |
|---|---|
| Wallets onboarded | **12** |
| Wallets with on-chain activity | **12** |
| Remittances received (total) | **12** |
| Volume routed | **490.00 rUSDC** |
| Auto-saved into vault | **124.60 rUSDC** |
| Currently held in vault | **124.60 rUSDC** |

## Per-wallet detail

Each wallet below performed at least four signed transactions: friendbot
funding, a faucet claim, an auto-save rule update, and an outbound remittance.

| # | Wallet | Received | Auto-saved | In vault | Transfers |
|---|---|---:|---:|---:|---:|
| 1 | [`GBQ7AQCR…ROV4NB`](https://stellar.expert/explorer/testnet/account/GBQ7AQCRYN74YN2R7XAJZRN2U5HCI4DSAR7KKRMQM4ADOWESNJROV4NB) | 32.00 | 3.20 | 3.20 | 1 |
| 2 | [`GCRYGXJG…SV3STO`](https://stellar.expert/explorer/testnet/account/GCRYGXJGKFQR7YE3ONRJKKONLPMYFY6XVVIZ43LU2Z6JQSKGYNSV3STO) | 20.00 | 4.00 | 4.00 | 1 |
| 3 | [`GBWJU2J7…JHKMA3`](https://stellar.expert/explorer/testnet/account/GBWJU2J7MTWCGWOE5L7NIJY3LVDWJTQAFUQA63XC4OTMQDJ5RFJHKMA3) | 35.00 | 7.00 | 7.00 | 1 |
| 4 | [`GABQY5LH…2FJEP4`](https://stellar.expert/explorer/testnet/account/GABQY5LHL5MLWDWPS5VCKNVTT2KR3F5X6RFH65XKDD24CH65FZ2FJEP4) | 50.00 | 12.50 | 12.50 | 1 |
| 5 | [`GDLJVNC4…R5LY43`](https://stellar.expert/explorer/testnet/account/GDLJVNC4WXHR5TF4WIWY6EW33HPNKREBNJNHZY6KZGPAMGSRV3R5LY43) | 25.00 | 7.50 | 7.50 | 1 |
| 6 | [`GABVRBXM…T4TSSY`](https://stellar.expert/explorer/testnet/account/GABVRBXM53SSODFVHKPTFGW6Q2WAJDEHRF44CQNDN77VA23EPQT4TSSY) | 75.00 | 37.50 | 37.50 | 1 |
| 7 | [`GA4WLS5O…Z4ICOP`](https://stellar.expert/explorer/testnet/account/GA4WLS5OFLZPWKASR6SEXOD5QRDCVMB72KLMJP4LY6TKY3ULNJZ4ICOP) | 40.00 | 0.00 | 0.00 | 1 |
| 8 | [`GBNRP7HM…NZ52I6`](https://stellar.expert/explorer/testnet/account/GBNRP7HM3H7D2ET77BBKGK4GUMAW7JR3RRKYZ2GGCKU3J6OOAHNZ52I6) | 30.00 | 4.50 | 4.50 | 1 |
| 9 | [`GD3L7WGE…A2KV6M`](https://stellar.expert/explorer/testnet/account/GD3L7WGE4JZVEF7X7FUPSSZ2PIZI3QNVSTAD4I6BGT27K6TMXUA2KV6M) | 60.00 | 12.00 | 12.00 | 1 |
| 10 | [`GDXW6KLC…2DUKFY`](https://stellar.expert/explorer/testnet/account/GDXW6KLCGMO6BWZ66AR3GV6PXEMEMQSGXNWC3AOV76EHZ7I25G2DUKFY) | 45.00 | 18.00 | 18.00 | 1 |
| 11 | [`GCFIMT6P…SIUPTJ`](https://stellar.expert/explorer/testnet/account/GCFIMT6PZJGSTQ6OYNSYY2VU4VMKBWQX4O345D4NVEX2DOIDUQSIUPTJ) | 50.00 | 10.00 | 10.00 | 1 |
| 12 | [`GCVOSA6H…HTOVPW`](https://stellar.expert/explorer/testnet/account/GCVOSA6HBQYUZTHYAPFPOBHGPRUI4GCG5N55XYWWMVMFYTUJ45HTOVPW) | 28.00 | 8.40 | 8.40 | 1 |

## How to verify

```bash
stellar contract invoke --id CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L \
  --source-account <any-funded-account> --network testnet \
  -- get_stats --recipient <wallet-address>
```

Or open any account link above and inspect its transaction history.
