# Demo rehearsal

Rehearsed 2026-11-25 against `https://mailkeep-hl3m.sprites.app` on commit `378902b62f4eb8a64d5623ebbd0755fad8419c06`.

## Reliable recording path

The public demo is the primary recording path because it needs no login and suppresses outbound email. Each run used a fresh Playwright context with no cookies at 1440×1000:

1. Open `/demo`; wait for **Riverbend PAST DUE**.
2. Run Riverbend; wait for **NEEDS YOU**, checks and the linked case.
3. Open the case file; verify both slips and the second-notice annotation.
4. Return to `/demo`; run **Urgent benefits notice**; verify **CAREFUL** and the fixed safety copy.
5. Open `/proof`; verify the deployed SHA, connectors, zero keys and evaluation.

Between runs, all `source=sample, trial=1` rows, their local files and Pinecone vectors were removed on the Sprite. The Riverbend case was restored from the seeded letter's stored route, including title, kind, due date and `second_notice=0`. Seeded letters and evaluation rows were not changed. The same cleanup was run after run 2, leaving the public demo at its seeded baseline.

## Run 1

| Beat                                        |      Elapsed |
| ------------------------------------------- | -----------: |
| `/demo` ready                               |      2.183 s |
| Riverbend processed and letter rendered     |     17.083 s |
| Case file ready                             |      0.832 s |
| Benefits scam processed and letter rendered |     17.395 s |
| `/proof` ready                              |      1.223 s |
| **Total**                                   | **38.716 s** |

- Riverbend trial: `ltr_izYBbRKa4gRPbtZxurfJg`; received **Dec 9, 2026**.
- Relations: `same matter · 0.99`, `second notice · 0.99`.
- Case: `case_zo1RyEj9hAIANY9ypKlTP`; open, due Dec 16, second notice received on Dec 9.
- Parent note: “Hi Ruth, The water bill is unpaid and now includes a late fee. Payment is required to avoid service disconnection. Keep it for now. Sarah will look at it. — Mailkeep”
- Decision: `jev-1.14.0`, 32 questions, 510 ms, $0.0005.
- Scam trial: `ltr_xObO6wF2pzSr7mkF0NTT_`; **CAREFUL**; received Dec 9.
- Scam parent note: “Hi Ruth, the letter from "Maple Senior Health Plan" looks like a scam. Don't pay it. Don't call the number on it. Don't give any card or account numbers. Sarah has been told. — Mailkeep”
- Scam “What it needs”: “Careful. Don't pay. Don't call the number on it. Sarah has been told.”
- Scam decision: `jev-1.14.0`, 31 questions, 1116 ms, $0.0005.
- Browser errors: none.

## Run 2

| Beat                                        |      Elapsed |
| ------------------------------------------- | -----------: |
| `/demo` ready                               |      2.145 s |
| Riverbend processed and letter rendered     |     18.613 s |
| Case file ready                             |      0.831 s |
| Benefits scam processed and letter rendered |     19.334 s |
| `/proof` ready                              |      1.221 s |
| **Total**                                   | **42.144 s** |

- Riverbend trial: `ltr_hfnlt2wi5HWKyW5DU_Lvk`; received **Dec 9, 2026**.
- Relations: `same matter · 0.99`, `second notice · 0.98`.
- Case: `case_zo1RyEj9hAIANY9ypKlTP`; open, due Dec 16, second notice received on Dec 9.
- Parent note and CAREFUL safety copy matched run 1.
- Riverbend decision: `jev-1.14.0`, 32 questions, 655 ms, $0.0005.
- Scam trial: `ltr_rl4ir4R77mxiEhXz8SWLV`; **CAREFUL**; received Dec 9.
- Scam decision: `jev-1.14.0`, 31 questions, 1093 ms, $0.0005.
- Browser errors: none.

## Slow steps and controls

| Risk                                 | Observed control                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold or slow first provider call     | Run 1's Riverbend beat took 17.083 s. Warm the URL 10 s before recording and keep the processing state on screen; do not cut during it.                                                                                |
| Variable Jev result near a threshold | Both runs linked at 0.99; follow-up was 0.99 then 0.98, both above 0.80. Show the checks table rather than promising one fixed probability.                                                                            |
| Public sample quota                  | Five runs per IP per hour. A rehearsal with four requests fits; an extra scam run was rate-limited. Reset trials does not reset the in-memory quota, so deploy/restart or wait for the window before a full rehearsal. |
| Trial reuse                          | The API intentionally reuses a recent identical trial. Reset sample trials before every run or the second pass will only reopen run 1's rows.                                                                          |
| Demo date drift                      | The clock now recalculates from fixed `DEMO_TODAY=2026-12-09` on every demo request. Both final runs displayed Dec 9.                                                                                                  |
| Unsafe CAREFUL copy                  | The page now shows the actual parent-note body and fixed safety copy; it never shows the model's raw “call this number” todo for CAREFUL letters.                                                                      |
| Everything else                      | Record a fallback screen capture at freeze. No video or audio was generated during rehearsal.                                                                                                                          |

## Fixes made during rehearsal

- `15a6d67` — demo trial timestamps use the household clock; demo case events use the linked letter's date; the letter DTO includes the parent-note body; CAREFUL letters show safety copy in both parent sections.
- `378902b` — the demo clock recalculates from the fixed demo date so it cannot drift when the real date changes.

## Not rehearsed on the public path

- `/mom` camera upload and inbound AgentMail email: T15 still needs the human inbound proof.
- Live “PAID” reply closing a case: T18 depends on T15. Unit/effect tests pass, but no live reply was claimed.
- Public Box folder: H8 still needs the founder to share folder `440822123671` as “People with the link · Can view.”
- Founder video, voice, social post and form submission: human-only H9/H10. Nothing was recorded, posted or submitted.
