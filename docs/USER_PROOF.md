# Proof of Wallet Interactions

Generated **2026-08-12T15:00:26.368Z** by `scripts/proof.mjs`, which reads
every figure below directly from the testnet ledger. Nothing here is
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
| AutoSplitRouter | [`CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L`](https://stellar.expert/explorer/testnet/contract/CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L) |
| SavingsVault | [`CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y`](https://stellar.expert/explorer/testnet/contract/CCF36HNGIGLQYCZYACJDLKKV42X4U7UXRAEDCOU3MTYYP7HLKOREMO3Y) |
| rUSDC token | [`CD3TKICZQDPXPOYDFZW4JFHX5AT7VFK2VJZQE22Q4CYZQKYDVLW2ZFP2`](https://stellar.expert/explorer/testnet/contract/CD3TKICZQDPXPOYDFZW4JFHX5AT7VFK2VJZQE22Q4CYZQKYDVLW2ZFP2) |

## Summary

| Metric | Value |
|---|---|
| Wallets tracked | **22** |
| Wallets with on-chain activity | **22** |
| Signed contract operations | **116** |
| Remittances sent | **47** |
| Remittances received | **45** |
| Volume routed | **3,522.00 rUSDC** |
| Auto-saved into vault | **371.20 rUSDC** |
| Currently held in vault | **371.20 rUSDC** |

## Pilot participants (12)

Wallets operated by pilot testers recruited through the feedback form. Each was
funded via friendbot, claimed test rUSDC, set an auto-save rule, and took part in
at least one remittance.

| # | Wallet | Signed ops | Sent | Received | Auto-saved | In vault | Latest transaction |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | [`GBQ7AQCR…ROV4NB`](https://stellar.expert/explorer/testnet/account/GBQ7AQCRYN74YN2R7XAJZRN2U5HCI4DSAR7KKRMQM4ADOWESNJROV4NB) | 7 | 40.00 | 64.00 | 6.40 | 6.40 | sent remittance · [`8b108cfb…`](https://stellar.expert/explorer/testnet/tx/8b108cfbe23f803c85bd45737c5939ce899ce511405949230ee4c68dcfca29cd) |
| 2 | [`GCRYGXJG…SV3STO`](https://stellar.expert/explorer/testnet/account/GCRYGXJGKFQR7YE3ONRJKKONLPMYFY6XVVIZ43LU2Z6JQSKGYNSV3STO) | 7 | 70.00 | 40.00 | 8.00 | 8.00 | sent remittance · [`8fd6d0a1…`](https://stellar.expert/explorer/testnet/tx/8fd6d0a1ea0e0dfa0977c69e3d2a52c0caaaba9ae4ec53f4cb0f99926917d44c) |
| 3 | [`GBWJU2J7…JHKMA3`](https://stellar.expert/explorer/testnet/account/GBWJU2J7MTWCGWOE5L7NIJY3LVDWJTQAFUQA63XC4OTMQDJ5RFJHKMA3) | 7 | 100.00 | 70.00 | 14.00 | 14.00 | sent remittance · [`48244773…`](https://stellar.expert/explorer/testnet/tx/4824477373f0d3d5ee700098e2673ac663d7ddeca66bf7eec4dc5c472cf6c3cb) |
| 4 | [`GABQY5LH…2FJEP4`](https://stellar.expert/explorer/testnet/account/GABQY5LHL5MLWDWPS5VCKNVTT2KR3F5X6RFH65XKDD24CH65FZ2FJEP4) | 7 | 50.00 | 100.00 | 25.00 | 25.00 | sent remittance · [`33e81f9c…`](https://stellar.expert/explorer/testnet/tx/33e81f9c86102b1a2c4b17d45d25c1565822f9dca076ccccb491542fda9267e2) |
| 5 | [`GDLJVNC4…R5LY43`](https://stellar.expert/explorer/testnet/account/GDLJVNC4WXHR5TF4WIWY6EW33HPNKREBNJNHZY6KZGPAMGSRV3R5LY43) | 7 | 150.00 | 50.00 | 15.00 | 15.00 | sent remittance · [`009a5e1c…`](https://stellar.expert/explorer/testnet/tx/009a5e1c28dacc1aa767459f822eda13293888364ba25e00f538825c1b6a8043) |
| 6 | [`GABVRBXM…T4TSSY`](https://stellar.expert/explorer/testnet/account/GABVRBXM53SSODFVHKPTFGW6Q2WAJDEHRF44CQNDN77VA23EPQT4TSSY) | 7 | 80.00 | 150.00 | 75.00 | 75.00 | sent remittance · [`4c45f5db…`](https://stellar.expert/explorer/testnet/tx/4c45f5db1b6b2186c861fe541677534acc7d65a24ccff6e2de916b1cefe81674) |
| 7 | [`GA4WLS5O…Z4ICOP`](https://stellar.expert/explorer/testnet/account/GA4WLS5OFLZPWKASR6SEXOD5QRDCVMB72KLMJP4LY6TKY3ULNJZ4ICOP) | 7 | 60.00 | 80.00 | 0.00 | 0.00 | sent remittance · [`1c7495cc…`](https://stellar.expert/explorer/testnet/tx/1c7495cc6dc77b9b670b9bd5501945bc325ed85c765c2b9baa9ee6f7ea41890f) |
| 8 | [`GBNRP7HM…NZ52I6`](https://stellar.expert/explorer/testnet/account/GBNRP7HM3H7D2ET77BBKGK4GUMAW7JR3RRKYZ2GGCKU3J6OOAHNZ52I6) | 7 | 120.00 | 60.00 | 9.00 | 9.00 | sent remittance · [`4ec11acc…`](https://stellar.expert/explorer/testnet/tx/4ec11accf2cffaa0434d4cc55340edf998137f765cda032b1a734e5a631edd07) |
| 9 | [`GD3L7WGE…A2KV6M`](https://stellar.expert/explorer/testnet/account/GD3L7WGE4JZVEF7X7FUPSSZ2PIZI3QNVSTAD4I6BGT27K6TMXUA2KV6M) | 7 | 90.00 | 120.00 | 24.00 | 24.00 | sent remittance · [`63afc667…`](https://stellar.expert/explorer/testnet/tx/63afc667469fe03ca941d1b8c15bcbe5424f2972433532ca100007ad3893c2f5) |
| 10 | [`GDXW6KLC…2DUKFY`](https://stellar.expert/explorer/testnet/account/GDXW6KLCGMO6BWZ66AR3GV6PXEMEMQSGXNWC3AOV76EHZ7I25G2DUKFY) | 7 | 100.00 | 90.00 | 36.00 | 36.00 | sent remittance · [`94b7eb7a…`](https://stellar.expert/explorer/testnet/tx/94b7eb7ad1a4cac2c894860ae8732b27567e960dab79d90d1657638989896efd) |
| 11 | [`GCFIMT6P…SIUPTJ`](https://stellar.expert/explorer/testnet/account/GCFIMT6PZJGSTQ6OYNSYY2VU4VMKBWQX4O345D4NVEX2DOIDUQSIUPTJ) | 6 | 56.00 | 100.00 | 20.00 | 20.00 | sent remittance · [`9cfbd1ea…`](https://stellar.expert/explorer/testnet/tx/9cfbd1eac2d493d8cf4574503040af94d59030985a01fab70433777fb42af66f) |
| 12 | [`GCVOSA6H…HTOVPW`](https://stellar.expert/explorer/testnet/account/GCVOSA6HBQYUZTHYAPFPOBHGPRUI4GCG5N55XYWWMVMFYTUJ45HTOVPW) | 6 | 64.00 | 56.00 | 16.80 | 16.80 | sent remittance · [`c4772061…`](https://stellar.expert/explorer/testnet/tx/c47720610c82dc89082c934974392fd92112079280e9628fdb22e06b8bc57798) |

## Builder-operated wallets (10)

Wallets funded and operated by the project author while testing the flow
end-to-end, each transaction individually approved through a Freighter
extension. Listed separately because they are **not** independent users and
should not be counted as such.

| # | Wallet | Signed ops | Sent | Received | Auto-saved | In vault | Latest transaction |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | [`GC4R7DAV…LMWRRQ`](https://stellar.expert/explorer/testnet/account/GC4R7DAV6A2CAVCDVD4J3SWT26JFPIQKLV643DEABDJH242ZJMLMWRRQ) | 2 | 200.00 | 10.00 | 0.00 | 0.00 | sent remittance · [`b1a220b9…`](https://stellar.expert/explorer/testnet/tx/b1a220b98cf6446e08167d9467f3cbf820b0ee2566e0978bebeaee4fe16b3f98) |
| 2 | [`GDC2RYWL…FZJI5X`](https://stellar.expert/explorer/testnet/account/GDC2RYWLBQY5NDGSPVA6OLYZKNF7SOLRJRTH7AWZGZ2SXMUPNTFZJI5X) | 16 | 1,217.00 | 0.00 | 0.00 | 0.00 | sent remittance · [`e223d8bb…`](https://stellar.expert/explorer/testnet/tx/e223d8bbc167de73f24b8f2a500fb4589846107dbe1a71f86d1591e98e1dca04) |
| 3 | [`GCE33AXG…YCNLLE`](https://stellar.expert/explorer/testnet/account/GCE33AXGEBOV4ZWY45ICQDSUHFH5UHC74IKVEXRBJNAE3KCZASYCNLLE) | 4 | 90.00 | 100.00 | 0.00 | 0.00 | claimed test rUSDC · [`fda8101d…`](https://stellar.expert/explorer/testnet/tx/fda8101ddb08af0aec975ffe2bead332fed2ed062032ecf797c1daf15a4732af) |
| 4 | [`GCRFDTLG…7AKIF7`](https://stellar.expert/explorer/testnet/account/GCRFDTLGG377MYPFMZMWYVQTW7ESORCS524YRLAHDWP4VIKGSP7AKIF7) | 1 | 0.00 | 100.00 | 0.00 | 0.00 | claimed test rUSDC · [`091bd0a6…`](https://stellar.expert/explorer/testnet/tx/091bd0a662b11d49bfed88f19ff0f9f6c4a615c3042ac35c0818c587fd139523) |
| 5 | [`GCDSPBZV…TBZKSL`](https://stellar.expert/explorer/testnet/account/GCDSPBZVVL6EYARHMWONVBGQSJ7I4ZXBKSIHQTYWPINL5ZQKZPTBZKSL) | 2 | 700.00 | 10.00 | 0.00 | 0.00 | sent remittance · [`a776e2d5…`](https://stellar.expert/explorer/testnet/tx/a776e2d5d84bc4a248c7cb8a00fdcdfe87fb88796dcdc44dc78fd23b04d4dfbc) |
| 6 | [`GCTG5ILZ…42AWBM`](https://stellar.expert/explorer/testnet/account/GCTG5ILZECJGE5AFHNA6DGAVK66KB6I76WZTLWIQ57FD54M5TY42AWBM) | 2 | 100.00 | 110.00 | 0.00 | 0.00 | claimed test rUSDC · [`9a873150…`](https://stellar.expert/explorer/testnet/tx/9a873150af435486fcf10d7291a71030a6541aa8ac6b92d43958207e2a5148a7) |
| 7 | [`GCIYZPVK…UWCP7O`](https://stellar.expert/explorer/testnet/account/GCIYZPVK4CFUX4CK766FTQGNEETNGQZEAPTFBZSN4GRPTQ5H6HUWCP7O) | 2 | 100.00 | 1,250.00 | 100.00 | 100.00 | set auto-save rule · [`3189c1a4…`](https://stellar.expert/explorer/testnet/tx/3189c1a4b5caf4b0ece6585ae0cd0c7c60ab6f0e603f520a2022b51430a89d4a) |
| 8 | [`GAPCMMWL…OYS47L`](https://stellar.expert/explorer/testnet/account/GAPCMMWLKKYEFBKLNEIIXJL52C24MPNVBOVTYFBTSBEIFRYEIPOYS47L) | 1 | 100.00 | 652.00 | 0.00 | 0.00 | sent remittance · [`f8b9a6d7…`](https://stellar.expert/explorer/testnet/tx/f8b9a6d75463fbe28ee4272b3abcee88fb2431be02b631b24e9522e569cc2231) |
| 9 | [`GAPBKFSL…URLD76`](https://stellar.expert/explorer/testnet/account/GAPBKFSLUNBM74MZ7BLXHAPEUOLDCG74X7B2KDFYVITMKCZ6PCURLD76) | 1 | 20.00 | 60.00 | 0.00 | 0.00 | sent remittance · [`50cc50ab…`](https://stellar.expert/explorer/testnet/tx/50cc50ab577bd95e3692d8a0ee2e092e96d81c5642a78883a917c67df38125a6) |
| 10 | [`GAHPFX2N…GU2WYZ`](https://stellar.expert/explorer/testnet/account/GAHPFX2NUTG63AWK4T4HZAB5O656F2ZEIXIXYPUQOEUWR5I7MPGU2WYZ) | 3 | 15.00 | 140.00 | 22.00 | 22.00 | sent remittance · [`4bccb95c…`](https://stellar.expert/explorer/testnet/tx/4bccb95c4ce312485d2fc44a52b248857496566a59f9a8d898bfa5951680ef8d) |

## How to verify

Any row can be checked without trusting this file.

```bash
# What the router recorded for a recipient
stellar contract invoke --id CAUHITYG2QOBX25HBP5NSGV4YJGJWIKFU5RAKIB5YC7IU6ZPBPUHFY4L \
  --source-account <any-funded-account> --network testnet \
  -- get_stats --recipient <wallet-address>

# What a wallet signed
curl "https://horizon-testnet.stellar.org/accounts/<wallet-address>/operations?limit=200"
```

Or open any account or transaction link above in the explorer.
