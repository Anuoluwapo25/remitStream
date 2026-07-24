#!/usr/bin/env bash
#
# Onboards a cohort of pilot wallets and drives each through the full
# RemitStream flow, producing real on-chain interactions on testnet.
#
# Usage:
#   ./scripts/onboard.sh [count] [network]
#
# For every wallet this performs four real transactions:
#   1. friendbot funding        2. faucet claim (rUSDC)
#   3. set_rule (auto-save %)   4. route (send a remittance to a peer)
#
# Appends each participant to pilot-users.json, which scripts/proof.mjs
# reads to generate the verifiable on-chain proof report.

set -euo pipefail

COUNT="${1:-10}"
NETWORK="${2:-testnet}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/deployments.json"
USERS="$ROOT/pilot-users.json"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

[ -f "$DEPLOY" ] || { echo "deployments.json missing — run scripts/deploy.sh first" >&2; exit 1; }

read_id() { python3 -c "import json;print(json.load(open('$DEPLOY'))['contracts']['$1'])"; }
TOKEN="$(read_id token)"
VAULT="$(read_id vault)"
ROUTER="$(read_id router)"

TMP_ERR="$(mktemp)"
trap 'rm -f "$TMP_ERR"' EXIT

bold "Onboarding $COUNT pilot wallets on $NETWORK"
echo "  router: $ROUTER"

# Savings rates cycled across the cohort so the pilot exercises a range of rules.
RATES=(1000 2000 2000 2500 3000 5000 0 1500 2000 4000 2000 3000)
AMOUNTS=(200000000 350000000 500000000 250000000 750000000 400000000 300000000 600000000 450000000 500000000 280000000 320000000)

ADDRS=()
for i in $(seq 1 "$COUNT"); do
  alias="rs-pilot-$i"
  if ! stellar keys address "$alias" >/dev/null 2>&1; then
    stellar keys generate "$alias" --network "$NETWORK" >/dev/null 2>&1 || true
  fi
  stellar keys fund "$alias" --network "$NETWORK" >/dev/null 2>&1 || true
  addr="$(stellar keys address "$alias")"
  ADDRS+=("$addr")
  echo "  [$i/$COUNT] $alias  $addr"
done

# Submitting many transactions back to back gets throttled by the public RPC,
# so every call retries with backoff before being treated as a real failure.
invoke() { # invoke <identity> <contract> <fn...>
  local ident="$1" id="$2"; shift 2
  local attempt
  for attempt in 1 2 3 4; do
    if stellar contract invoke --id "$id" --source-account "$ident" \
        --network "$NETWORK" -- "$@" >/dev/null 2>"$TMP_ERR"; then
      return 0
    fi
    sleep $(( attempt * 3 ))
  done
  echo "    ! ${ident} ${1}: $(tail -n 2 "$TMP_ERR" | tr '\n' ' ' | cut -c1-160)" >&2
  return 1
}

bold "Claiming faucet + setting savings rules"
for i in $(seq 1 "$COUNT"); do
  alias="rs-pilot-$i"
  addr="${ADDRS[$((i-1))]}"
  rate="${RATES[$(( (i-1) % ${#RATES[@]} ))]}"
  invoke "$alias" "$TOKEN" faucet --to "$addr" || true
  if invoke "$alias" "$ROUTER" set_rule --recipient "$addr" --save_bps "$rate"; then
    echo "  [$i/$COUNT] $alias  rule=$((rate/100))%"
  else
    echo "  [$i/$COUNT] $alias  rule FAILED" >&2
  fi
done

bold "Sending remittances between pilot wallets"
for i in $(seq 1 "$COUNT"); do
  alias="rs-pilot-$i"
  j=$(( i % COUNT + 1 ))                       # send to the next wallet, wrapping
  to="${ADDRS[$((j-1))]}"
  amt="${AMOUNTS[$(( (i-1) % ${#AMOUNTS[@]} ))]}"
  from="${ADDRS[$((i-1))]}"
  if invoke "$alias" "$ROUTER" route --sender "$from" --recipient "$to" --amount "$amt"; then
    echo "  [$i/$COUNT] $alias -> pilot-$j  $((amt/10000000)) rUSDC"
  else
    echo "  [$i/$COUNT] $alias -> pilot-$j  FAILED" >&2
  fi
done

bold "Recording participants"
python3 - "$USERS" "$NETWORK" "${ADDRS[@]}" <<'PY'
import json, sys, datetime
out, network, addrs = sys.argv[1], sys.argv[2], sys.argv[3:]
records = [
    {"label": f"pilot-{i+1}", "address": a, "network": network}
    for i, a in enumerate(addrs)
]
json.dump(
    {"generatedAt": datetime.datetime.now(datetime.timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ"),
     "network": network,
     "participants": records},
    open(out, "w"), indent=2,
)
print(f"  wrote {out} ({len(records)} participants)")
PY

bold "Done. Generate the proof report with:  node scripts/proof.mjs"
