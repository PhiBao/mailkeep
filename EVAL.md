# Mailkeep EVAL

- Run: `eval-20261124205222457`
- Generated: 2026-11-24T20:55:39.857Z
- Split: non-held-out
- Models: `jev-1.14.0`, `gemma4:31b`
- Thresholds: `2026-11-24.3`

## Tuning log

| Round                         | Changes                                                                                                                                                                |  Lane | Link precision | Link recall | Amount exact | Due exact | False alarms | Never unsafe |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | -------------: | ----------: | -----------: | --------: | -----------: | -----------: |
| Baseline (2026-11-24.1)       | A§9/A§10 starting wording and thresholds                                                                                                                               | 63.3% |          38.9% |       77.8% |        22.2% |     77.8% |            5 |        30/30 |
| Round 1 (2026-11-24.2)        | Specific same-matter evidence; required-action and scam wording; field confidence 0.80 → 0.70                                                                          | 73.3% |          70.0% |       77.8% |        44.4% |     66.7% |            5 |        30/30 |
| Round 2 (2026-11-24.3, final) | Contextual gift-card rule; retire unsupported impersonation judgment; explicit amount/deadline and quiet-mail wording; infoQuiet 0.85 → 0.75; non-thinking bounded OCR | 96.7% |          72.7% |       88.9% |        11.1% |     88.9% |            1 |        30/30 |

Round 2 removed the L16 timeout but exposed two unresolved quality gaps: same_matter sometimes selects an older letter (L03 → L01 instead of L02), and the more explicit amount question lowered choice confidence below the 0.70 field gate on eight payable letters. The two-round tuning budget is exhausted; no further prompt or threshold changes are allowed before the held-out run.

Held-out letters were not used for any tuning round.

## Targets

- Never unsafe: 30/30
- Scams caught: 3/3
- Link precision ≥ 0.90; recall ≥ 0.80
- Lane accuracy ≥ 0.85
- Ask rate ≤ 0.25

## Summary

| Metric                   |  Result |
| ------------------------ | ------: |
| Letters                  |      30 |
| Lane accuracy            |   96.7% |
| Never unsafe             |   30/30 |
| False scam alarms        |       1 |
| Scams caught             |     3/3 |
| Link precision           |   72.7% |
| Link recall              |   88.9% |
| Amount exact             |   11.1% |
| Due exact                |   88.9% |
| Ask rate                 |    3.3% |
| Average cost             | $0.0004 |
| Average decision latency |  549 ms |

## Letters

| ID  | Lane      | Kind                 | Amount | Due        | Relations                                           | Asks  | Cost (µ$) | Latency (ms) |
| --- | --------- | -------------------- | -----: | ---------- | --------------------------------------------------- | ----- | --------: | -----------: |
| L06 | handled   | statement            |      — | —          | —                                                   | —     |       401 |          259 |
| L13 | handled   | statement            |      — | —          | —                                                   | —     |       434 |          214 |
| L34 | handled   | statement            |      — | —          | same_matter→L13                                     | —     |       240 |          267 |
| L04 | needs_you | government           |      — | 2026-12-15 | —                                                   | —     |       465 |          204 |
| L20 | handled   | marketing            |      — | —          | —                                                   | —     |       220 |          951 |
| L01 | headsup   | bill                 |      — | 2026-12-10 | same_matter→L04                                     | link  |       426 |         1381 |
| L15 | headsup   | bill                 |      — | 2026-12-02 | —                                                   | —     |       498 |          604 |
| L10 | headsup   | renewal              |      — | 2027-01-03 | —                                                   | —     |       508 |          683 |
| L21 | handled   | marketing            |      — | —          | —                                                   | —     |       476 |          402 |
| L12 | headsup   | renewal              |      — | 2026-12-31 | —                                                   | —     |       487 |          282 |
| L23 | headsup   | appointment          |      — | 2026-12-14 | —                                                   | —     |       385 |          907 |
| L30 | headsup   | bill                 |      — | 2026-12-12 | —                                                   | —     |       525 |         1160 |
| L19 | needs_you | other                |      — | —          | —                                                   | check |       405 |         1419 |
| L22 | handled   | personal             |      — | —          | —                                                   | —     |       157 |          280 |
| L17 | careful   | marketing            |      — | —          | —                                                   | —     |       460 |          206 |
| L29 | needs_you | collection           |    250 | —          | —                                                   | —     |       421 |          246 |
| L07 | handled   | statement            |   3300 | —          | same_matter→L06                                     | —     |       526 |          315 |
| L18 | careful   | marketing            |      — | —          | —                                                   | —     |       297 |          253 |
| L24 | handled   | marketing            |      — | —          | —                                                   | —     |       297 |          301 |
| L32 | handled   | marketing            |      — | —          | —                                                   | —     |       225 |          217 |
| L08 | handled   | statement            |      — | —          | same_matter→L06                                     | —     |       471 |          459 |
| L25 | handled   | statement            |      — | —          | same_matter→L01                                     | —     |       557 |          324 |
| L16 | careful   | collection           |      — | —          | same_matter→L15, follow_up→L15, sender_mismatch→L15 | —     |      1459 |          231 |
| L05 | handled   | payment_confirmation |      — | —          | same_matter→L04, completes→L04                      | —     |       405 |         1096 |
| L09 | careful   | —                    |      — | —          | same_matter→L06, sender_mismatch→L06                | —     |       455 |         1249 |
| L11 | handled   | statement            |      — | —          | same_matter→L10                                     | —     |       497 |          236 |
| L26 | handled   | marketing            |      — | —          | —                                                   | —     |       427 |          748 |
| L02 | needs_you | —                    |      — | 2026-12-16 | same_matter→L01, follow_up→L01                      | —     |       513 |          229 |
| L28 | handled   | personal             |      — | —          | —                                                   | —     |       192 |          728 |
| L03 | handled   | payment_confirmation |      — | —          | same_matter→L01                                     | paid  |       408 |          617 |

## Failures

| Letter | Reason                                                        |
| ------ | ------------------------------------------------------------- |
| L04    | amount mismatch                                               |
| L01    | amount mismatch                                               |
| L15    | amount mismatch                                               |
| L10    | amount mismatch                                               |
| L12    | amount mismatch                                               |
| L30    | amount mismatch                                               |
| L16    | lane careful; false scam alarm; amount mismatch; due mismatch |
| L02    | amount mismatch                                               |
| L03    | missing completes → L02                                       |

## Held-out (run once, untuned)

- Run: `heldout-20261125042539630`
- Generated: 2026-11-25T04:26:39.619Z
- Split: held-out (run once, untuned)
- Models: `jev-1.14.0`, `gemma4:31b`
- Thresholds: `2026-11-24.3`

## Targets

- Never unsafe: 6/6
- Scams caught: 2/2
- Link precision ≥ 0.90; recall ≥ 0.80
- Lane accuracy ≥ 0.85
- Ask rate ≤ 0.25

## Summary

| Metric                   |  Result |
| ------------------------ | ------: |
| Letters                  |       6 |
| Lane accuracy            |   83.3% |
| Never unsafe             |     6/6 |
| False scam alarms        |       0 |
| Scams caught             |     1/2 |
| Link precision           |  100.0% |
| Link recall              |  100.0% |
| Amount exact             |    0.0% |
| Due exact                |  100.0% |
| Ask rate                 |   33.3% |
| Average cost             | $0.0004 |
| Average decision latency |  726 ms |

## Letters

| ID  | Lane      | Kind       | Amount | Due        | Relations                      | Asks  | Cost (µ$) | Latency (ms) |
| --- | --------- | ---------- | -----: | ---------- | ------------------------------ | ----- | --------: | -----------: |
| L27 | needs_you | government |      — | 2026-12-28 | —                              | —     |       400 |          622 |
| L33 | needs_you | —          |      — | —          | —                              | kind  |       304 |          707 |
| L36 | needs_you | statement  |      — | —          | —                              | check |       404 |         1212 |
| L35 | careful   | government |      — | —          | —                              | —     |       338 |          919 |
| L31 | needs_you | collection |      — | 2026-12-14 | same_matter→L30, follow_up→L30 | —     |       481 |          395 |
| L14 | handled   | statement  |      — | —          | same_matter→L13                | —     |       551 |          502 |

## Failures

| Letter | Reason          |
| ------ | --------------- |
| L27    | amount mismatch |
| L33    | scam not caught |
| L36    | lane needs_you  |
| L31    | amount mismatch |

### Untuned failure notes

- **L27:** lane and due date are correct. Jev selected the $310 candidate with confidence 0.34, below the frozen 0.70 field gate, so Mailkeep withheld the amount.
- **L31:** lane, due date and both links are correct. Jev selected the $132.40 candidate with confidence 0.42, below the 0.70 field gate, so the amount was withheld.
- **L33:** the letter was safely escalated to `needs_you` with a kind Ask. Its highest kind probability was 0.55, below the 0.60 acceptance bar. The truth allows `careful` or `needs_you`; the strict “scams caught” metric counts only `careful`, so this is a metric miss without an unsafe route.
- **L36:** the genuine pension statement was not treated as a scam. Jev classified it as a statement at 0.63, below the frozen 0.75 quiet-mail bar, with `needs_action=0.03`; the safe fallback asked for a check instead of filing it automatically.
- **Ask rate:** L33's kind Ask and L36's check Ask account for 2/6 letters (33.3%).
- **Links:** L14→L13 and L31→L30 both passed with 100% precision and recall. L13 and L30 were run only as held-out thread history and are excluded from the six-letter metrics.

No prompt, threshold or routing change was made after this run. The held-out set remains untuned.
