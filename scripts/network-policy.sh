#!/usr/bin/env bash
set -euo pipefail

sprite_name="${1:-mailkeep}"
policy_file="$(mktemp)"
trap 'rm -f "$policy_file"' EXIT

cat >"$policy_file" <<JSON
{
  "rules": [
    { "include": "defaults" },
    { "domain": "api.sprites.dev", "action": "allow" },
    { "domain": "*.agentmail.to", "action": "allow" },
    { "domain": "cdn.agentmail.to", "action": "allow" },
    { "domain": "github.com", "action": "allow" },
    { "domain": "*.githubusercontent.com", "action": "allow" },
    { "domain": "registry.npmjs.org", "action": "allow" },
    { "domain": "example.org", "action": "deny" },
    { "domain": "*", "action": "deny" }
  ]
}
JSON

sprite api "/v1/sprites/${sprite_name}/policy/network" -- \
  -fsS -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "@${policy_file}"
