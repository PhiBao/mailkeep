# Demo rehearsal

Final canonical rehearsals: 2026-11-25 against `https://mailkeep-hl3m.sprites.app` on product commit `d6de088e53e4b74cf0de735805c0db7caf9a4cd8`.

## Reliable recording path

The public demo is the primary recording path because it needs no login and suppresses outbound email. Each run used a fresh Playwright Chromium context at 1440×1000:

1. Open `/demo`; wait for **Riverbend PAST DUE**.
2. Run Riverbend; wait for **NEEDS YOU**, the linked case, second-notice evidence and Recall.
3. Open `/demo`; run **Urgent benefits notice**; wait for **CAREFUL** and the fixed safety copy.
4. Open `/proof`; verify the deployed SHA, boot capture, thresholds, held-out split, amount/due accuracy and costs.

Between runs, all `source=sample, trial=1` rows, their local files and Pinecone vectors were removed on the Sprite. Seeded cases were restored from the trial baseline. The final cleanup left the Riverbend case open, due Dec 10 with `second_notice=0`, one seeded letter and no public trial rows. Evaluation rows were never selected by purge.

## Run 1

| Beat                                        |      Elapsed |
| ------------------------------------------- | -----------: |
| `/demo` ready                               |      2.328 s |
| Riverbend processed and letter rendered     |     19.336 s |
| Benefits scam processed and letter rendered |     17.485 s |
| `/proof` ready                              |      1.220 s |
| **Total**                                   | **41.216 s** |

- Riverbend trial: `ltr_LTMzYOPSoZfdrDj2eQrzC`; received **Dec 9, 2026**.
- Relations: `same matter · 0.99`, `second notice · 0.98`.
- What it needs: “Pay the outstanding water bill balance. · due Dec 16, 2026 · 7 days”.
- Why: “Second notice for this bill.”
- Recall: exact account-tail match + Pinecone 0.78, linked; semantic candidates 0.57, 0.50, 0.49, 0.45 and 0.41.
- Decision: `jev-1.14.0`, 32 questions, 894 ms, estimated letter cost $0.0005.
- Scam trial: `ltr_Z4KKvson3DGWVi0z3P2q3`; **CAREFUL**; title “Verify Member Card for Benefits”.
- Scam needs: “Careful. Don't pay. Don't call the number on it. Sarah has been told.”
- Scam decision: `jev-1.14.0`, 31 questions, 1017 ms, $0.0005.
- Browser errors: no page errors. One console CSP fallback notice and transient `ERR_NETWORK_CHANGED` messages.

## Run 2

| Beat                                        |      Elapsed |
| ------------------------------------------- | -----------: |
| `/demo` ready                               |      2.306 s |
| Riverbend processed and letter rendered     |     15.283 s |
| Benefits scam processed and letter rendered |     18.260 s |
| `/proof` ready                              |      1.241 s |
| **Total**                                   | **37.815 s** |

- Riverbend trial: `ltr__sFLu2I99yvqISI4WJ_P0`; received **Dec 9, 2026**.
- Relations: `same matter · 0.99`, `second notice · 0.98`.
- What it needs: “Pay the outstanding water bill balance. · $89.17 · due Dec 16, 2026 · 7 days”.
- Recall: exact account-tail match + Pinecone 0.78, linked; semantic candidates 0.57, 0.50, 0.49, 0.45 and 0.41.
- Decision: `jev-1.14.0`, 32 questions, 1078 ms, $0.0005.
- Scam trial: `ltr_TR-MdxKvT-9FG7PsTMLuw`; **CAREFUL**; same safety copy.
- Scam decision: `jev-1.14.0`, 31 questions, 1224 ms, $0.0005.
- Browser errors: no page errors. The only console message was the CSP fallback notice.

## Proof state after runs

- Deployed SHA: `d6de088e53e4b74cf0de735805c0db7caf9a4cd8`.
- Evaluation shown: `heldout-20261125042539630`, 6 held-out letters.
- Lane accuracy 83.3%, never unsafe 6/6, false alarms 0, scams caught 1/2.
- Link precision / recall 100% / 100%, amount exact 0%, due exact 100%, ask rate 33.3%.
- At the time of the runs `/proof` showed the boot capture and stated that uptime/service state are snapshots, not live polling.

## Slow steps and controls

| Risk                                 | Observed control                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold or slow first provider call     | Riverbend took 15.283–19.336 s. Warm the URL before recording and keep the four-step processing state on screen; do not cut during it.                                                                      |
| Variable Jev result near a threshold | Links held at 0.99/0.98 in both runs. Amount extraction was withheld in run 1 and accepted at $89.17 in run 2, so show the checks and “withheld” explanation rather than promising one fixed amount result. |
| Public sample quota                  | Five runs per IP per hour. Each rehearsal uses two samples. Restarting the service resets the in-memory window; resetting trials does not.                                                                  |
| Trial reuse                          | The API intentionally reuses a recent identical trial. Purge sample trials before each run or the second pass reopens run 1's rows.                                                                         |
| Demo baseline mutation               | Trial runs can mutate seeded case state. A transaction-time case baseline is restored when the last sample expires; seeded Box case files are not rewritten by trials.                                      |
| Unsafe CAREFUL copy                  | The page shows the actual parent-note body and fixed safety copy; it never shows the model's raw “call this number” todo for CAREFUL letters.                                                               |
| Console noise                        | Both runs had no page errors. The app emits a CSP fallback notice because `script-src` is not explicit; run 1 also saw transient network-change messages.                                                   |

## Not rehearsed

- `/mom` camera upload on a physical phone: the backend upload path is tested, but no phone-camera rehearsal is claimed.
- Public Box folder: H8 still needs the founder to share folder `440822123671` as “People with the link · Can view.”
- Founder video, voice, social post and form submission: human-only H9/H10. Nothing was recorded, posted or submitted.
