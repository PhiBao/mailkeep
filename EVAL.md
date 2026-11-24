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
