#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORG="${MAILKEEP_FLY_ORG:-kiter}"
SPRITE="mailkeep"

if [[ ! "$SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: scripts/deploy.sh <commit-sha>" >&2
  exit 1
fi
if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "Working tree is dirty; commit or stash before deploying." >&2
  exit 1
fi
git -C "$ROOT" cat-file -e "$SHA^{commit}"
if ! git -C "$ROOT" branch -r --contains "$SHA" 2>/dev/null | grep -q .; then
  echo "Commit $SHA is not on a remote branch; push it before deploying." >&2
  exit 1
fi

REMOTE_URL="$(git -C "$ROOT" remote get-url origin)"
case "$REMOTE_URL" in
  https://*) ;;
  *)
    echo "The Sprite clone needs an HTTPS GitHub remote." >&2
    exit 1
    ;;
esac

URL="$(sprite info "$SPRITE" -o "$ORG" | awk -F': ' '/^URL:/{print $2}')"
sprite checkpoint create -s "$SPRITE" -o "$ORG" --comment "pre-deploy $SHA"

if ! sprite exec -o "$ORG" -s "$SPRITE" -- test -d /home/sprite/mailkeep/.git; then
  sprite exec -o "$ORG" -s "$SPRITE" -- git clone "$REMOTE_URL" /home/sprite/mailkeep
fi

sprite exec -o "$ORG" -s "$SPRITE" -- bash -lc \
  "cd ~/mailkeep && git fetch -q && git checkout -q '$SHA' && corepack pnpm i --frozen-lockfile && corepack pnpm build && node apps/agent/dist/cli/admin.js migrate"

ENV_VALUES="PORT=8080,MAILKEEP_PUBLIC_URL=$URL,MAILKEEP_DATA_DIR=/home/sprite/mailkeep-data,MAILKEEP_AGENTMAIL_INBOX_ID=kiter@agentmail.to,MAILKEEP_PINECONE_INDEX=mailkeep-letters,MAILKEEP_JEV_MODEL=jev-1.14.0,MAILKEEP_OLLAMA_MODEL=gemma4:31b,MAILKEEP_DEMO_HOUSEHOLD_ID=hh_demo,MAILKEEP_TICK_MIN_INTERVAL_S=300,LOG_LEVEL=info"

if sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services get mailkeep >/dev/null 2>&1; then
  sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services restart mailkeep
else
  sprite exec -o "$ORG" -s "$SPRITE" -- sprite-env services create mailkeep \
    --cmd node --args "apps/agent/dist/main.js" --dir /home/sprite/mailkeep \
    --http-port 8080 --env "$ENV_VALUES" --no-stream
fi

for _ in $(seq 1 60); do
  BODY="$(curl -fsS "$URL/healthz" 2>/dev/null || true)"
  if printf '%s' "$BODY" | node -e \
    "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.exit(JSON.parse(s).sha===process.argv[1]?0:1)}catch{process.exit(1)}})" \
    "$SHA"; then
    printf 'Deployed %s to %s\n' "$SHA" "$URL"
    exit 0
  fi
  sleep 1
done

echo "Deploy did not return the expected SHA from $URL/healthz within 60 seconds." >&2
exit 1
