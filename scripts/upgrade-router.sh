#!/usr/bin/env bash
#
# Deploys a fresh AutoSplitRouter and swaps it in on the *existing* vault and
# token — unlike deploy.sh, this never touches token or vault, so nobody's
# wallet balance or vault savings are affected. Use this to ship a router
# change (like the savings-goals rewrite) without resetting the pilot.
#
# Usage:
#   ./scripts/upgrade-router.sh [network] [identity]
#
# Reads the current vault/token addresses out of deployments.json, deploys
# the router built at contracts/target/.../auto_split_router.wasm, points the
# vault at it, and rewrites only the "router" field (plus deployedAt).

set -euo pipefail

NETWORK="${1:-testnet}"
IDENTITY="${2:-remitstream-admin}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="$ROOT/contracts"
WASM_DIR="$CONTRACTS/target/wasm32v1-none/release"
OUT="$ROOT/deployments.json"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }

if [ ! -f "$OUT" ]; then
  echo "No deployments.json found — run deploy.sh first for a fresh stack." >&2
  exit 1
fi

VAULT_ID="$(python3 -c "import json; print(json.load(open('$OUT'))['contracts']['vault'])")"
TOKEN_ID="$(python3 -c "import json; print(json.load(open('$OUT'))['contracts']['token'])")"

bold "Router upgrade -> $NETWORK (as $IDENTITY)"
info "existing vault: $VAULT_ID"
info "existing token: $TOKEN_ID"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "Identity '$IDENTITY' not found. Create it with:" >&2
  echo "  stellar keys generate $IDENTITY --network $NETWORK --fund" >&2
  exit 1
fi
ADMIN="$(stellar keys address "$IDENTITY")"
info "admin: $ADMIN"

bold "[1/4] Building contracts"
(cd "$CONTRACTS" && stellar contract build >/dev/null 2>&1)
info "ok"

bold "[2/4] Deploying the new router"
ROUTER_ID="$(stellar contract deploy \
  --wasm "$WASM_DIR/auto_split_router.wasm" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  2>/dev/null | tail -n 1)"
info "$ROUTER_ID"

bold "[3/4] Initializing it against the existing vault + token"
stellar contract invoke --id "$ROUTER_ID" --source-account "$IDENTITY" --network "$NETWORK" \
  -- initialize --admin "$ADMIN" --vault "$VAULT_ID" --token "$TOKEN_ID" >/dev/null
info "ok"

bold "[4/4] Authorizing it on the vault"
stellar contract invoke --id "$VAULT_ID" --source-account "$IDENTITY" --network "$NETWORK" \
  -- set_router --router "$ROUTER_ID" >/dev/null
info "ok"

python3 - "$OUT" "$ROUTER_ID" <<'PY'
import json, sys, datetime
path, router_id = sys.argv[1], sys.argv[2]
data = json.load(open(path))
data["contracts"]["router"] = router_id
data["deployedAt"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY

bold "Done. Old router is still on-chain but no longer authorized on the vault."
info "New router: $ROUTER_ID"
info "Set NEXT_PUBLIC_ROUTER_ID=$ROUTER_ID for the web app (or update config.ts's default)."
cat "$OUT"
