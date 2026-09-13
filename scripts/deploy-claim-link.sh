#!/usr/bin/env bash
#
# Deploys the ClaimLink contract and wires it to the existing token — a
# brand-new, independent contract, so this never touches token, vault, or
# router. Adds a "claims" field to deployments.json.
#
# Usage:
#   ./scripts/deploy-claim-link.sh [network] [identity]

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

TOKEN_ID="$(python3 -c "import json; print(json.load(open('$OUT'))['contracts']['token'])")"

bold "ClaimLink deploy -> $NETWORK (as $IDENTITY)"
info "existing token: $TOKEN_ID"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "Identity '$IDENTITY' not found. Create it with:" >&2
  echo "  stellar keys generate $IDENTITY --network $NETWORK --fund" >&2
  exit 1
fi

bold "[1/3] Building contracts"
(cd "$CONTRACTS" && stellar contract build >/dev/null 2>&1)
info "ok"

bold "[2/3] Deploying ClaimLink"
CLAIMS_ID="$(stellar contract deploy \
  --wasm "$WASM_DIR/claim_link.wasm" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  2>/dev/null | tail -n 1)"
info "$CLAIMS_ID"

bold "[3/3] Initializing it against the existing token"
stellar contract invoke --id "$CLAIMS_ID" --source-account "$IDENTITY" --network "$NETWORK" \
  -- initialize --token "$TOKEN_ID" >/dev/null
info "ok"

python3 - "$OUT" "$CLAIMS_ID" <<'PY'
import json, sys
path, claims_id = sys.argv[1], sys.argv[2]
data = json.load(open(path))
data["contracts"]["claims"] = claims_id
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY

bold "Done."
info "New ClaimLink contract: $CLAIMS_ID"
info "Set NEXT_PUBLIC_CLAIMS_ID=$CLAIMS_ID for the web app to turn the feature on."
cat "$OUT"
