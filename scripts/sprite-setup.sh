#!/usr/bin/env bash
set -euo pipefail

ORG="${1:-${MAILKEEP_FLY_ORG:-kiter}}"
SPRITE="mailkeep"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! sprite info "$SPRITE" -o "$ORG" >/dev/null 2>&1; then
  sprite create "$SPRITE" -o "$ORG" --skip-console
fi

sprite exec -o "$ORG" -s "$SPRITE" -- bash -lc \
  'sudo apt-get update && sudo apt-get install -y poppler-utils'

NODE_VERSION="$(sprite exec -o "$ORG" -s "$SPRITE" -- node -v)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Node $NODE_VERSION is too old; stopping rather than installing a different runtime." >&2
  exit 1
fi

COREPACK_VERSION="$(sprite exec -o "$ORG" -s "$SPRITE" -- corepack --version)"
UBUNTU_VERSION="$(sprite exec -o "$ORG" -s "$SPRITE" -- bash -lc '. /etc/os-release && echo "$PRETTY_NAME"')"
POPPLER_VERSION="$(sprite exec -o "$ORG" -s "$SPRITE" -- bash -lc 'pdftotext -v 2>&1 | head -1')"
DISK="$(sprite exec -o "$ORG" -s "$SPRITE" -- bash -lc 'df -h /home/sprite | tail -1')"

sprite exec -o "$ORG" -s "$SPRITE" -- corepack enable
sprite exec -o "$ORG" -s "$SPRITE" -- install -d -m 700 /home/sprite/mailkeep-data
sprite config update --url-auth public "$SPRITE" -o "$ORG"

if ! sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services get hello >/dev/null 2>&1; then
  sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services create hello \
    --cmd python3 --args "-m,http.server,8080" --http-port 8080 --no-stream
fi

cleanup() {
  sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services delete hello >/dev/null 2>&1 || true
}
trap cleanup EXIT

URL="$(sprite info "$SPRITE" -o "$ORG" | awk -F': ' '/^URL:/{print $2}')"
HTTP_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --retry 20 --retry-all-errors --retry-delay 1 "$URL")"
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "Expected HTTP 200 from $URL, got $HTTP_STATUS" >&2
  exit 1
fi

cleanup
trap - EXIT

SERVICE_STATE="deferred until first deploy"
if sprite exec -o "$ORG" -s "$SPRITE" -- test -f /home/sprite/mailkeep/apps/agent/dist/main.js; then
  if ! sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services get mailkeep >/dev/null 2>&1; then
    ENV_VALUES="PORT=8080,MAILKEEP_PUBLIC_URL=$URL,MAILKEEP_DATA_DIR=/home/sprite/mailkeep-data,MAILKEEP_PINECONE_INDEX=mailkeep-letters,MAILKEEP_JEV_MODEL=jev-1.14.0,MAILKEEP_OLLAMA_MODEL=gemma4:31b,MAILKEEP_DEMO_HOUSEHOLD_ID=hh_demo,MAILKEEP_TICK_MIN_INTERVAL_S=300,LOG_LEVEL=info"
    sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services create mailkeep \
      --cmd node --args "apps/agent/dist/main.js" --dir /home/sprite/mailkeep \
      --http-port 8080 --env "$ENV_VALUES" --no-stream
  fi
  SERVICE_STATE="mailkeep service configured"
fi

mkdir -p "$ROOT/docs"
cat >"$ROOT/docs/platform.md" <<EOF
# Platform

Recorded by \`scripts/sprite-setup.sh\` on $(date -u +%Y-%m-%d).

- Fly org: \`$ORG\`
- Sprite: \`$SPRITE\`
- Public URL: $URL
- URL auth: public
- Node: \`$NODE_VERSION\`
- corepack: \`$COREPACK_VERSION\`
- Ubuntu: \`$UBUNTU_VERSION\`
- Poppler: \`$POPPLER_VERSION\`
- Data directory: \`/home/sprite/mailkeep-data\` (0700)
- Disk: \`$DISK\`
- Routing proof: temporary \`hello\` service returned HTTP $HTTP_STATUS, then was deleted.
- Agent service: \`$SERVICE_STATE\`.
EOF

printf 'Sprite ready: %s\n' "$URL"
