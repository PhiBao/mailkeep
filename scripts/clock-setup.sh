#!/usr/bin/env bash
set -euo pipefail

app_name="${MAILKEEP_CLOCK_APP:-mailkeep-clock}"
public_url="${MAILKEEP_PUBLIC_URL:-https://mailkeep-hl3m.sprites.app}"
public_url="${public_url%/}"

if ! fly apps list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const apps=JSON.parse(s);process.exit(apps.some(a=>a.Name===process.argv[1])?0:1)})' "$app_name"; then
  fly apps create "$app_name"
fi

fly machine run curlimages/curl:8.11.1 \
  --app "$app_name" \
  --schedule hourly \
  --restart no \
  -- -fsS -m 20 -X POST "$public_url/tick"

fly machine list --app "$app_name"
