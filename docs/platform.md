# Platform

Recorded by `scripts/sprite-setup.sh` on 2026-11-24.

- Fly org: `kiter`
- Sprite: `mailkeep`
- Public URL: https://mailkeep-hl3m.sprites.app
- URL auth: public
- Node: `v24.22.1`
- corepack: `0.36.0`
- Ubuntu: `Ubuntu 26.04.1 LTS`
- Poppler: `pdftotext version 26.01.0`
- Data directory: `/home/sprite/mailkeep-data` (0700)
- Disk: `overlay          99G   50M   99G   1% /`
- Routing proof: temporary `hello` service returned HTTP 200, then was deleted.
- Agent service: `mailkeep`, public URL above, port 8080, source `apps/agent/dist/main.js`.

## Demo household

- Household: `hh_demo` · "Ruth's mail" · fixed demo date 2026-12-09.
- Seed: 21 `demo=seed` letters through the real pipeline; 16 handled/headsup; all six required open cases present.
- Box root folder: `440822123671`; per-case files are under `Cases`.
- Live sample proof: L02 trial `ltr_zAIs3FpqDcCqHAWByfOiu` joined `case_zo1RyEj9hAIANY9ypKlTP` with same_matter 0.99 and follow_up 0.99.
- H8 pending: share the Box root as “People with the link · Can view” and store the URL with `scripts/seed-demo.ts --box-link <url>`.

## Chase clock

- App: `mailkeep-clock`; machine `d8d2123c9d36d8`; hourly schedule; restart policy `no`.
- Command: `fly machine run curlimages/curl:8.11.1 --app mailkeep-clock --schedule hourly --restart no -- -fsS -m 20 -X POST https://mailkeep-hl3m.sprites.app/tick`.
- Setup script: `scripts/clock-setup.sh`.

## Network policy

- Applied from the dev machine with `scripts/network-policy.sh` via `POST /v1/sprites/mailkeep/policy/network`.
- Rules: Fly defaults; allow `api.sprites.dev`, `*.agentmail.to`, `cdn.agentmail.to`, `github.com`, `*.githubusercontent.com`, `registry.npmjs.org`; explicit deny `example.org`; deny `*`.
- Verified on the Sprite: `dig example.org` → REFUSED; `github.com` and `cdn.agentmail.to` resolve; provider smoke 5/5 PASS.
- `sprite checkpoint list` shows pre-deploy checkpoints through v63.
