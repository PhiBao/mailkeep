# Mailkeep EVAL

- Run: `eval-20261124202849073`
- Generated: 2026-11-24T20:41:21.285Z
- Split: non-held-out
- Models: `jev-1.14.0`, `gemma4:31b`
- Thresholds: `2026-11-24.2`

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
| Lane accuracy            |   73.3% |
| Never unsafe             |   30/30 |
| False scam alarms        |       5 |
| Scams caught             |     3/3 |
| Link precision           |   70.0% |
| Link recall              |   77.8% |
| Amount exact             |   44.4% |
| Due exact                |   66.7% |
| Ask rate                 |   10.0% |
| Average cost             | $0.0004 |
| Average decision latency |  402 ms |

## Letters

| ID  | Lane      | Kind                 | Amount | Due        | Relations                            | Asks  | Cost (µ$) | Latency (ms) |
| --- | --------- | -------------------- | -----: | ---------- | ------------------------------------ | ----- | --------: | -----------: |
| L06 | handled   | statement            |   3500 | —          | —                                    | —     |       399 |          529 |
| L13 | handled   | statement            |      — | —          | —                                    | —     |       433 |          683 |
| L34 | handled   | statement            |      — | —          | same_matter→L13                      | —     |       239 |          425 |
| L04 | careful   | government           |      — | —          | —                                    | —     |       462 |          441 |
| L20 | handled   | marketing            |      — | —          | —                                    | —     |       221 |          438 |
| L01 | headsup   | bill                 |   8417 | 2026-12-10 | same_matter→L04                      | link  |       425 |          228 |
| L15 | headsup   | bill                 |      — | 2026-12-02 | —                                    | —     |       495 |          229 |
| L10 | headsup   | renewal              |  41200 | 2027-01-03 | —                                    | —     |       504 |          182 |
| L21 | careful   | marketing            |      — | —          | —                                    | —     |       473 |          280 |
| L12 | careful   | renewal              |      — | —          | —                                    | —     |       483 |          602 |
| L23 | headsup   | appointment          |      — | 2026-12-14 | —                                    | —     |       385 |          493 |
| L30 | headsup   | bill                 |  13240 | 2026-12-12 | —                                    | —     |       527 |          442 |
| L19 | needs_you | other                |      — | —          | —                                    | check |       403 |          321 |
| L22 | handled   | personal             |      — | —          | —                                    | —     |       157 |          390 |
| L17 | careful   | marketing            |      — | —          | —                                    | —     |       456 |          304 |
| L29 | needs_you | collection           |    250 | —          | —                                    | —     |       414 |          401 |
| L07 | handled   | statement            |   3300 | —          | same_matter→L06                      | —     |       524 |          320 |
| L18 | careful   | marketing            |      — | —          | —                                    | —     |       287 |          217 |
| L24 | careful   | marketing            |      — | —          | —                                    | —     |       296 |          329 |
| L32 | handled   | marketing            |      — | —          | —                                    | —     |       225 |          200 |
| L08 | handled   | statement            |      — | —          | same_matter→L06                      | —     |       469 |          220 |
| L25 | needs_you | statement            |      — | —          | same_matter→L01                      | check |       553 |          597 |
| L16 | —         | —                    |      — | —          | —                                    | —     |         0 |            0 |
| L05 | handled   | payment_confirmation |      — | —          | same_matter→L04, completes→L04       | —     |       404 |          257 |
| L09 | careful   | —                    |      — | —          | same_matter→L06, sender_mismatch→L06 | —     |       455 |          438 |
| L11 | needs_you | statement            |  41200 | —          | same_matter→L10                      | check |       494 |          471 |
| L26 | careful   | other                |      — | —          | —                                    | —     |       418 |         1012 |
| L02 | needs_you | collection           |      — | 2026-12-16 | same_matter→L01, follow_up→L01       | —     |       510 |          903 |
| L28 | handled   | personal             |      — | —          | —                                    | —     |       192 |          237 |
| L03 | handled   | payment_confirmation |      — | —          | same_matter→L01                      | paid  |       410 |          456 |

## Failures

| Letter | Reason                                                               |
| ------ | -------------------------------------------------------------------- |
| L04    | lane careful; false scam alarm; amount mismatch; due mismatch        |
| L15    | amount mismatch                                                      |
| L21    | lane careful; false scam alarm                                       |
| L12    | lane careful; false scam alarm; amount mismatch; due mismatch        |
| L24    | lane careful; false scam alarm                                       |
| L25    | lane needs_you                                                       |
| L16    | lane missing; amount mismatch; due mismatch; missing follow_up → L15 |
| L11    | lane needs_you                                                       |
| L26    | lane careful; false scam alarm                                       |
| L02    | amount mismatch                                                      |
| L03    | missing completes → L02                                              |
