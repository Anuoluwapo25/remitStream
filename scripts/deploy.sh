#!/usr/bin/env bash
#
# Deploys the RemitStream contract suite and wires them together.
#
# Usage:
#   ./scripts/deploy.sh [network] [identity]
#
# Writes the resulting addresses to deployments.json, which the web app reads
# at build time. Re-running deploys a fresh set of contracts.

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

bold "[1/5] Building contracts"
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

bold "[2/5] Deploying rUSDC token"
TOKEN_ID="$(deploy remit_token)"
info "$TOKEN_ID"
invoke "$TOKEN_ID" initialize --admin "$ADMIN"
info "initialized"

bold "[3/5] Deploying SavingsVault"
VAULT_ID="$(deploy savings_vault)"
info "$VAULT_ID"
invoke "$VAULT_ID" initialize --admin "$ADMIN" --token "$TOKEN_ID"
info "initialized"

bold "[4/5] Deploying AutoSplitRouter"
ROUTER_ID="$(deploy auto_split_router)"
info "$ROUTER_ID"
invoke "$ROUTER_ID" initialize --admin "$ADMIN" --vault "$VAULT_ID" --token "$TOKEN_ID"
info "initialized"

bold "[5/5] Authorizing router on vault"
invoke "$VAULT_ID" set_router --router "$ROUTER_ID"
info "ok"

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
    "router": "$ROUTER_ID"
  }
}
JSON

bold "Done. Wrote $OUT"
cat "$OUT"
