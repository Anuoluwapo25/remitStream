#!/usr/bin/env bash
#
# Deploys the RemitStream contract suite and wires them together.
#
# Usage:
#   ./scripts/deploy.sh [network] [identity]
#
# Writes the resulting addresses to deployments.json, which the web app reads
# at build time. Re-running deploys a fresh set of contracts — every existing
# balance and vault deposit goes with it, since the token contract is new too.
#
# To ship a router change (e.g. the savings-goals rewrite) onto an existing
# pilot without resetting anyone's balance, use upgrade-router.sh instead —
# it deploys only the router and re-wires the existing vault to it.
# To turn on claim links or savings circles against an existing deployment,
# use deploy-claim-link.sh / deploy-savings-circle.sh — both are new,
# independent contracts, so neither touches token, vault, or router.

set -euo pipefail

NETWORK="${1:-testnet}"
IDENTITY="${2:-remitstream-admin}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="$ROOT/contracts"
WASM_DIR="$CONTRACTS/target/wasm32v1-none/release"
OUT="$ROOT/deployments.json"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }

bold "RemitStream deploy -> $NETWORK (as $IDENTITY)"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "Identity '$IDENTITY' not found. Create it with:" >&2
  echo "  stellar keys generate $IDENTITY --network $NETWORK --fund" >&2
  exit 1
fi
ADMIN="$(stellar keys address "$IDENTITY")"
info "admin: $ADMIN"

bold "[1/7] Building contracts"
(cd "$CONTRACTS" && stellar contract build >/dev/null 2>&1)
info "ok"

deploy() {
  # deploy <wasm-name> -> prints contract id
  stellar contract deploy \
    --wasm "$WASM_DIR/$1.wasm" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    2>/dev/null | tail -n 1
}

invoke() {
  # invoke <contract-id> <fn> [args...]
  local id="$1"; shift
  stellar contract invoke \
    --id "$id" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    -- "$@" >/dev/null 2>&1
}

bold "[2/7] Deploying rUSDC token"
TOKEN_ID="$(deploy remit_token)"
info "$TOKEN_ID"
invoke "$TOKEN_ID" initialize --admin "$ADMIN"
info "initialized"

bold "[3/7] Deploying SavingsVault"
VAULT_ID="$(deploy savings_vault)"
info "$VAULT_ID"
invoke "$VAULT_ID" initialize --admin "$ADMIN" --token "$TOKEN_ID"
info "initialized"

bold "[4/7] Deploying AutoSplitRouter"
ROUTER_ID="$(deploy auto_split_router)"
info "$ROUTER_ID"
invoke "$ROUTER_ID" initialize --admin "$ADMIN" --vault "$VAULT_ID" --token "$TOKEN_ID"
info "initialized"

bold "[5/7] Authorizing router on vault"
invoke "$VAULT_ID" set_router --router "$ROUTER_ID"
info "ok"

bold "[6/7] Deploying ClaimLink"
CLAIMS_ID="$(deploy claim_link)"
info "$CLAIMS_ID"
invoke "$CLAIMS_ID" initialize --token "$TOKEN_ID"
info "initialized"

bold "[7/7] Deploying SavingsCircle"
CIRCLES_ID="$(deploy savings_circle)"
info "$CIRCLES_ID"
info "no initialize() needed — a circle's token is chosen per-circle at creation"

case "$NETWORK" in
  testnet)  PASSPHRASE="Test SDF Network ; September 2015"; RPC="https://soroban-testnet.stellar.org" ;;
  mainnet)  PASSPHRASE="Public Global Stellar Network ; September 2015"; RPC="https://mainnet.sorobanrpc.com" ;;
  *)        PASSPHRASE="unknown"; RPC="unknown" ;;
esac

cat > "$OUT" <<JSON
{
  "network": "$NETWORK",
  "networkPassphrase": "$PASSPHRASE",
  "rpcUrl": "$RPC",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "admin": "$ADMIN",
  "contracts": {
    "token": "$TOKEN_ID",
    "vault": "$VAULT_ID",
    "router": "$ROUTER_ID",
    "claims": "$CLAIMS_ID",
    "circles": "$CIRCLES_ID"
  }
}
JSON

bold "Done. Wrote $OUT"
cat "$OUT"
