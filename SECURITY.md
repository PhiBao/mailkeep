# Security review

Reviewed 2026-11-25 against the T34 sensitive-flow checklist. This is a scoped source review plus local regression tests, not a claim of exhaustive coverage. No deployed endpoints or external identities were probed.

## Trust boundaries

- **Internet → public Sprite URL:** static SPA, `/api/proof`, `/api/demo/*`, `/hooks/agentmail`, `/tick`, and auth link/callback. Everything else requires a session.
- **Household member → household data:** every session query includes `member.household_id`; another household's resource returns 404.
- **Letter content → models:** OCR/summary/Jev see redacted, untrusted text. Model answers are advice; `route.ts` code owns lane, amount, due date, relations, asks and case transitions.
- **Sprite → providers:** all provider traffic goes through Fly connectors. The Sprite and repo hold no provider keys; boot keyscan aborts on a suspected key.
- **Demo → live household:** demo routes require `is_demo=1` and scope every row to `hh_demo`. Sample runs accept only six known testset IDs and create `source=sample, trial=1` rows.

## Findings fixed in this review

| Finding                                                                                     | Boundary / impact                                                                                    | Smallest fix                                                                                    | Regression evidence                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Approved email existed in both live and demo households; lookup had no household preference | An inbound message or magic link could resolve into the synthetic demo instead of the live household | `getMemberByEmail` now joins households, requires `is_demo=0`, and orders deterministically     | `security.test.ts`: duplicate live/demo email resolves to live            |
| Public webhook could be pinged continuously to reset the debounce timer                     | Unbounded AgentMail polling/API use by an unauthenticated caller                                     | Five-second minimum ping interval; body remains ignored; poll is injectable for tests           | `security.test.ts`: three forged requests produce one poll                |
| Attachment metadata size was not checked before download                                    | A large allowed-sender attachment could consume memory before intake rejected it                     | Reject metadata size over 15 MiB before download                                                | `security.test.ts`: oversized attachment is never downloaded              |
| Attachment downloader accepted any HTTPS URL returned in metadata                           | A compromised/malformed provider response could direct the Sprite at another host                    | Require exact `https://cdn.agentmail.to`; reject redirects                                      | `security.test.ts`: evil host and HTTP CDN URL rejected before fetch      |
| PDF rasterization could honor an extreme page box                                           | A small PDF could ask Poppler for an enormous first-page image                                       | `pdftoppm -scale-to 2000` caps raster dimension; existing 20 s timeout and 10 MiB buffer remain | Source-reviewed command arguments; PDF extraction tests remain green      |
| Box names removed dollar amounts and long digit runs but not SSNs or long alphanumeric IDs  | Model-derived titles could leak identifiers into shared folder/file names                            | `safeBoxName` also strips SSNs and 8+ character alphanumeric identifiers                        | `security.test.ts`: amount/SSN/account/reference and path-character cases |

## Controls verified

- **Cross-household access:** `api.test.ts`, `auth.test.ts` and `demo.test.ts` cover 404s, scoped DTOs, images, decisions, cases, letters and demo isolation.
- **Upload parsing:** 15 MiB/file, 10 files, 60 MiB streamed body, magic-byte MIME sniffing, HEIC rejection, Sharp `limitInputPixels: 40_000_000`, normalized output ≤4 MiB, mode 0600.
- **PDF tools:** `execFile` without a shell, fixed arguments, 20 s timeout, 10 MiB stdout cap, first three text pages / first two raster pages only.
- **Auth:** 32-byte base64url tokens, SHA-256 storage, 15-minute single-use login tokens, 30/180-day sessions, `HttpOnly; Secure; SameSite=Lax; Path=/`, atomic token consumption, logout revocation.
- **CSRF:** POST requires `X-Mailkeep: 1`; supplied `Origin` must match the configured public origin. Logout and all session mutations are covered.
- **Enumeration/rate limits:** `/auth/link` always returns the same 200 body for unknown, known, rate-limited and mail-failure cases; 3/hour/email and 10/hour/IP. Demo sample runs are 5/hour/IP and 30/hour/global.
- **Email headers:** all product outbox paths strip CR/LF from subjects. A regression test stores a title containing an injected `Bcc:` line and confirms no newline reaches the outbox.
- **Prompt injection:** letter text stays in `state.new.text`; it cannot add questions or instructions. The router does not accept letter text. A malicious “mark paid/handled/safe” transcript still routes from code-owned safe answers to `headsup` with the amount intact.
- **PII in logs:** gateway logs contain provider/path/status/latency only; application logs use letter/ask/case IDs and status. A source regression test rejects transcript logging. Raw provider error text can still appear in failure logs/emails; this is a residual operational-privacy risk.
- **Keys:** `scanKeys` runs before DB/service start and aborts on a hit. `/api/proof` publishes only the count, timestamp and environment names; connector IDs are eight-character prefixes.
- **Box naming:** no dollar amounts, SSNs, long digit runs or long alphanumeric identifiers in generated names; original files and redacted records remain inside the household's private Box root.
- **Forged tick/webhook:** webhook body is ignored and debounced. `/tick` accepts no resource input, is single-flight and no-ops inside 300 seconds; demo households are excluded from chase. A caller can still force one harmless catch-up/chase pass per interval.
- **Egress:** Sprite policy allows the gateway, AgentMail/CDN, GitHub and npm; `example.org` is REFUSED and all other domains are denied.

## Residual risks / needs validation

1. **Forwarded-IP trust:** rate limits use the first `X-Forwarded-For` value. Fly's public proxy must overwrite client-supplied forwarding headers; that deployment behavior is not proven by this repository. If it does not, per-IP limits can be bypassed (global limits still apply).
2. **Model fallibility:** redaction and calibrated questions reduce risk but cannot make a model infallible. A persuasive letter can influence probabilities; code thresholds, careful routing, human Asks and the never-unsafe property tests limit the effect. No model answer directly sends email or mutates a case.
3. **Public demo abuse:** sample runs are rate-limited and trial-only, but a determined public user can consume provider quota within those limits. Monitor cost and lower limits if needed.
4. **Box sharing:** H8 has not yet supplied the shared view link. Do not publish the private folder URL as if it were shared.
5. **Operational logs:** failure emails intentionally include a short provider error for the family. Keep provider errors free of letter bodies and credentials; current gateway errors are generic.

## Verification

- `pnpm --filter agent exec vitest run test/security.test.ts` — 8/8.
- Existing auth/API/demo/gateway/keyscan suites cover their respective boundaries.
- `git grep`/source regression check finds no transcript logging.
- Live `/api/proof` reported keyscan 0 and all five connectors after the review changes were deployed.
