#!/usr/bin/env bash
#
# Deploys the SavingsCircle contract — a brand-new, independent contract, so
# this never touches token, vault, router, or claims. Adds a "circles" field
# to deployments.json.
#
# Unlike the other contracts, SavingsCircle needs no initialize() call: each
# circle picks its own settlement token when it's created, not once for the
# whole contract, so more than one asset can be circled through the same
# deployment.
#
# Usage:
#   ./scripts/deploy-savings-circle.sh [network] [identity]

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

bold "SavingsCircle deploy -> $NETWORK (as $IDENTITY)"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "Identity '$IDENTITY' not found. Create it with:" >&2
  echo "  stellar keys generate $IDENTITY --network $NETWORK --fund" >&2
  exit 1
fi

bold "[1/2] Building contracts"
(cd "$CONTRACTS" && stellar contract build >/dev/null 2>&1)
info "ok"

bold "[2/2] Deploying SavingsCircle"
CIRCLES_ID="$(stellar contract deploy \
  --wasm "$WASM_DIR/savings_circle.wasm" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  2>/dev/null | tail -n 1)"
info "$CIRCLES_ID"

python3 - "$OUT" "$CIRCLES_ID" <<'PY'
import json, sys
path, circles_id = sys.argv[1], sys.argv[2]
data = json.load(open(path))
data["contracts"]["circles"] = circles_id
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY

bold "Done."
info "New SavingsCircle contract: $CIRCLES_ID"
info "Set NEXT_PUBLIC_CIRCLES_ID=$CIRCLES_ID for the web app to turn the feature on."
cat "$OUT"
