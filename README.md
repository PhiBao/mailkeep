# Mailkeep

**Mailkeep remembers every letter Mom gets, and notices when the second notice arrives.**

A personal mail agent on a Fly.io Sprite for the adult child of an older parent. Mom photographs or forwards a letter. Mailkeep reads it, recalls the household's past letters, decides with calibrated confidence what it is and what it relates to, files it in the family's Box, tells Mom in plain words, and alerts the family only when it needs them.

**[Open the live demo](https://mailkeep-hl3m.sprites.app/demo)** · **[See how it runs](https://mailkeep-hl3m.sprites.app/proof)** · **[Code](https://github.com/PhiBao/mailkeep)**

**Demo video:** _pending founder recording (H9); no video has been generated._

## Try it in 60 seconds

1. Open [/demo](https://mailkeep-hl3m.sprites.app/demo).
2. Click **Riverbend PAST DUE**.
3. Watch the live letter join the Nov 18 water-bill case with `same_matter=0.99` and `follow_up=0.99`.
4. Open [/proof](https://mailkeep-hl3m.sprites.app/proof) to see the Sprite, connectors, keyscan, thresholds, evaluation and cost.

Proof: [live `/proof`](https://mailkeep-hl3m.sprites.app/proof) · [EVAL.md](EVAL.md) · [Box folder](https://app.box.com/folder/440822123671) (_public sharing pending H8_) · [model/provider proof commit](https://github.com/PhiBao/mailkeep/commit/ef31881).

## Product

**User.** The adult child who lives hours away and is already the family's paperwork person. The parent is the second user: they only photograph or forward letters.

**Problem.** Bills, renewals and scam letters arrive daily. The one that matters often looks like the others. A quoted r/ExpatFIRE workaround is “calendars, reminders and a lot of phone calls.” The 2025 IC3 snapshot cited in the research notes reports 201,266 complaints from people 60+ and $7.749B in losses ([source](https://elaca.org/2025-ic3-report-snapshot/)).

**Value.** Mailkeep keeps a readable household memory, catches second notices and contradictions, files the evidence in Box, and asks only when the decision is uncertain or high-stakes.

**Why now.** Calibrated per-question decisions make comparison against household history practical. Sprites provide an always-available agent that can wake on email. Fly connectors let the agent use Box, AgentMail, Ollama, TypeSafe and Pinecone without holding their keys.

**Insight.** Household mail is a set of threads—accounts, cases and obligations—not a stream of documents. The risk is in the gaps between letters: a reminder for a bill nobody paid, a “renewal” from a company that never wrote before, or a familiar name with different contact details.

## Experience

1. Mom emails a photo or uses the large-type `/mom` camera page.
2. Mailkeep reads, redacts, recalls and decides.
3. The original and a redacted record go to Box; `case.md` is versioned.
4. Mom gets a plain sentence. The family gets an Ask, second-notice, contradiction, overdue or scam alert only when needed.
5. The family answers by email reply or web button; the case and Box record update.

The family desk shows the photo, the exact checks, probabilities, thresholds, recall candidates and raw Jev response. The parent page never shows probabilities.

## Innovation

Most classifiers guess a label silently. Mailkeep asks a calibrated model several narrow questions, then lets code apply a different bar to each action: link at 0.85, warn on a scam signal at 0.5, and close a bill as paid only at 0.9. It compares each letter with the household's history and keeps the case state across weeks. Uncertain links become Asks instead of confident mistakes.

## Hacksgiving relevance

Built for the Grand Prize: a useful agent, a visible “second notice” moment, and a security story that fits Sprites and connectors.

- **Built during Hacksgiving:** all project code and synthetic letters were written November 24–25, 2026.
- **Runs on Fly.io Sprites using connectors:** the `mailkeep` service runs on the public Sprite; every provider call goes through `api.sprites.dev/v1/gateway`.

| Connector                   | One job                                         | Source                                                   |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Ollama Cloud (`gemma4:31b`) | Read photos and write summaries                 | [ollama.ts](apps/agent/src/providers/ollama.ts#L1)       |
| TypeSafe (`jev-1.14.0`)     | Calibrated kind, link, scam and field judgments | [typesafe.ts](apps/agent/src/providers/typesafe.ts#L1)   |
| Pinecone                    | Recall past household letters                   | [pinecone.ts](apps/agent/src/providers/pinecone.ts#L1)   |
| Box                         | Family case files and versioned `case.md`       | [box.ts](apps/agent/src/providers/box.ts#L1)             |
| AgentMail                   | Inbound photos, outbound notes and replies      | [agentmail.ts](apps/agent/src/providers/agentmail.ts#L1) |
| Sprites gateway             | Broker every provider credential                | [client.ts](apps/agent/src/gateway/client.ts#L1)         |

## Prior art

[pyaroslav/kitchen-table](https://github.com/pyaroslav/kitchen-table) demonstrated local family-mail reading. Mailkeep focuses on the missing family loop: cross-letter memory, calibrated escalation, case state, Box filing and answers that change the case. SilverSafe is reactive and one-item-at-a-time; bank monitors see money after it moves; Paperless-ngx is owner-focused and does not provide this calibrated family escalation.

## Provenance

- Built November 24–25, 2026 for Fly.io Hacksgiving.
- TypeScript, React 19, Vite 7, Hono, SQLite, Sharp, Playwright and Vitest.
- AI coding assistant: HungerG. Product, architecture, design and evaluation decisions are documented in this repository. No personal family story is claimed.
- Providers and models are pinned in configuration and in the linked proof commit.

## Architecture

```text
Mom → AgentMail → Sprite mailkeep service
                    ├─ Ollama: read + redact
                    ├─ Pinecone: recall
                    ├─ TypeSafe Jev: calibrated questions
                    ├─ code router: lane, case, asks
                    ├─ Box: case files
                    └─ AgentMail: parent note / family Ask
```

The backend is required: the Sprites gateway only accepts provider calls from inside a Sprite. SQLite stores household state; Pinecone stores vector memory; Box remains readable without Mailkeep. Hand-authored SVG diagrams are maintained under `docs/diagrams/` during final documentation.

## How it decides

| Check                |       Bar | Code-owned effect                   |
| -------------------- | --------: | ----------------------------------- |
| Any scam signal      |    ≥ 0.50 | CAREFUL; never sets an amount owed  |
| Sender consistency   |    < 0.30 | Sender mismatch on a linked letter  |
| Same matter          |    ≥ 0.85 | Link to the past case               |
| Same-matter Ask band | 0.50–0.85 | Ask which letter matches            |
| Follow-up            |    ≥ 0.80 | Second notice / contradiction       |
| Completion accepted  |    ≥ 0.90 | Paid signal                         |
| Completion Ask band  | 0.60–0.90 | Ask whether it was paid             |
| Kind accepted        |    ≥ 0.60 | Otherwise Ask kind                  |
| Field confidence     |    ≥ 0.70 | Use the selected amount or due date |

The router is a pure function in [route.ts](apps/agent/src/pipeline/route.ts#L1). Letter text cannot add questions or directly mark a case paid. See [SECURITY.md](SECURITY.md) for prompt-injection and trust-boundary tests.

## Running

Prerequisites: Node 22+, Corepack, pnpm, Fly/Sprite CLI access, Poppler, and the five connectors. No provider keys belong in `.env` or on the Sprite.

```bash
pnpm install
pnpm test
pnpm build
pnpm biome check .
pnpm testset:build
```

Configuration names are in [.env.example](.env.example). Provider discovery and the exact working paths are in [spikes/gateway/RESULT.md](spikes/gateway/RESULT.md).

Deploy only through the checkpointed script:

```bash
bash scripts/deploy.sh "$(git rev-parse HEAD)"
```

The script creates a pre-deploy Sprite checkpoint, checks out the pushed SHA on the Sprite, builds, migrates and waits for `/healthz` to report that SHA.

Operational scripts: [clock-setup.sh](scripts/clock-setup.sh) for the hourly Fly chase machine, [network-policy.sh](scripts/network-policy.sh) for the egress allowlist, and [seed-demo.ts](scripts/seed-demo.ts) for the real-pipeline demo household.

## Demo

The public demo is read-only except for six rate-limited synthetic sample runs. Sample letters create trial rows, use the real pipeline, file under Box `Trials/`, suppress email and expire after 24 hours. The demo clock is fixed at December 9, 2026.

Live proof: sample L02 (`ltr_zAIs3FpqDcCqHAWByfOiu`) joined seeded case `case_zo1RyEj9hAIANY9ypKlTP` with `same_matter=0.99` and `follow_up=0.99`.

## Verification

| Area                      | Status         | Evidence                                                                                                                                  |
| ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Live demo and proof       | Live           | [/demo](https://mailkeep-hl3m.sprites.app/demo), [/proof](https://mailkeep-hl3m.sprites.app/proof)                                        |
| Real provider pipeline    | Live           | 21-letter demo seed; L03 upload and parent-note email; five-provider smoke                                                                |
| Magic-link session        | Live           | AgentMail message `<010001a20f7d6240-a40b0d24-2102-4bf8-82dc-58290fddafdd-000000@email.amazonses.com>`; callback created `/today` session |
| Scheduled chase           | Live           | `mailkeep-clock` hourly machine; Sprite `tick_complete` log                                                                               |
| Egress policy             | Live           | `example.org` REFUSED; gateway and AgentMail CDN allowed                                                                                  |
| Unit/integration tests    | Passing        | 185 agent tests, shared tests and eval selection/report tests                                                                             |
| Browser tests             | Passing        | Today, Case, Letter, Mom/Login, Proof, Demo, Shoebox, ten states and 55 anti-slop checks                                                  |
| T15 human inbound email   | Awaiting human | Webhook configured path returns 202; fresh inbound proof still needed                                                                     |
| T18 live PAID reply       | Awaiting T15   | Unit/effect tests pass                                                                                                                    |
| T25 exact L01 amount copy | Known gap      | Live API returned amount null; UI fixture verifies intended copy                                                                          |
| H8 Box public sharing     | Awaiting human | Folder exists; shared view link not yet supplied                                                                                          |
| Video/social/form         | Human tasks    | Scripts/package are prepared; nothing posted or submitted                                                                                 |

## Evaluation

Non-held-out, 30 letters (`eval-20261124205222457`, thresholds `2026-11-24.3`):

| Metric                  |        Result |
| ----------------------- | ------------: |
| Never unsafe            |         30/30 |
| Scams caught            |           3/3 |
| Lane accuracy           |         96.7% |
| Link precision / recall | 72.7% / 88.9% |
| Amount / due exact      | 11.1% / 88.9% |
| Ask rate                |          3.3% |

Held-out, six letters, run once (`heldout-20261125042539630`):

| Metric                  |      Result |
| ----------------------- | ----------: |
| Never unsafe            |         6/6 |
| False scam alarms       |           0 |
| Link precision / recall | 100% / 100% |
| Lane accuracy           |       83.3% |
| Amount / due exact      |   0% / 100% |
| Ask rate                |       33.3% |

The strict scam metric reports 1/2 because L33 was safely routed to `needs_you`, which its truth allows, rather than `careful`. L36's genuine pension statement was not treated as a scam. Full raw results and every failure explanation are in [EVAL.md](EVAL.md). No prompt or threshold changed after the held-out run.

## Security and privacy

- Provider credentials stay in Fly connectors; the boot keyscan aborts on a suspected key and `/proof` publishes only names/prefixes.
- Transcripts are redacted before summary, decisions and storage. Originals remain private to the household's Box.
- Session routes scope every query by household; cross-household resources return 404.
- Tokens are single-use and hashed; cookies are `HttpOnly; Secure; SameSite=Lax`.
- POSTs require CSRF headers and same-origin checks; public demo and tick inputs are bounded.
- Uploads have byte, file-count, pixel, PDF-timeout and raster-dimension limits; attachment downloads are restricted to the AgentMail CDN.
- The Sprite egress policy denies unlisted domains.

Details and residual risks: [SECURITY.md](SECURITY.md).

## Limitations and roadmap

- Amount confidence is the largest quality gap: many payable letters withhold the amount rather than guess.
- Same-matter selection can prefer an older related letter; the non-held-out link precision is below target.
- The held-out sample is small; lane accuracy and Ask rate missed their targets, while safety and links held.
- The product is English-only and uses synthetic evaluation letters, not real family mail.
- Provider latency and availability remain external dependencies. The public demo can consume quota within its rate limits.
- Next: more real-photo validation, multilingual parent copy, calibrated amount extraction and sibling household support.

## Why us

No personal story is claimed. The work is visible: provider spikes, raw evaluations, threshold tables, a public proof page, security findings and screenshots of every state. The demo's second-notice moment is real pipeline output, not a staged result.

## License

[MIT](LICENSE).
