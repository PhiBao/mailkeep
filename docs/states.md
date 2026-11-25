# Failure, empty and edge states

Verified with `pnpm exec playwright test apps/web/e2e/states.spec.ts` at 390×844. API failures are injected at the browser boundary; the provider-timeout screen uses the real `Gateway request to ollama timed out` error text, and gateway timeout mapping is covered by `apps/agent/test/gateway.test.ts`.

| State            | Screenshot                           | Forced condition                            | Expected result                                  |
| ---------------- | ------------------------------------ | ------------------------------------------- | ------------------------------------------------ |
| Loading          | `screens/state-loading.png`          | Delayed `/api/today`                        | Three paper skeletons, no spinner                |
| Load error       | `screens/state-error.png`            | `/api/today` HTTP 500                       | “Couldn't load.” and Retry                       |
| Empty household  | `screens/state-empty.png`            | Empty TodayDTO                              | “Nothing needs you right now.”                   |
| Processing       | `screens/state-processing.png`       | Letter status `queued`                      | Four-step reading/recalling/deciding/filing list |
| Provider timeout | `screens/state-provider-timeout.png` | Letter status `failed`, Ollama timeout text | Failure banner, mono error and Try again         |
| Needs retake     | `screens/state-needs-retake.png`     | Letter status `needs_retake`                | Plain retake instruction; no probabilities       |
| Expired link     | `screens/state-expired-link.png`     | `/login?error=expired`                      | Ask for a new link                               |
| Rate limit       | `screens/state-rate-limit.png`       | Demo sample POST 429                        | Calm retry-later message                         |
| Upload error     | `screens/state-upload-error.png`     | Mom upload HTTP 500                         | Ask for another photo                            |
| Case error       | `screens/state-case-error.png`       | Case API HTTP 500                           | “Couldn't load.” and Retry                       |

Failure email copy is centralized in `apps/agent/src/notify/templates.ts` as `failureEmail`; subjects strip CR/LF before entering the outbox.
