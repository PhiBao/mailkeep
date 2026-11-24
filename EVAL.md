# Mailkeep EVAL

- Run: `eval-20261124200841896`
- Generated: 2026-11-24T20:21:25.386Z
- Split: non-held-out
- Models: `jev-1.14.0`, `gemma4:31b`
- Thresholds: `2026-11-24.1`

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
| Lane accuracy            |   63.3% |
| Never unsafe             |   30/30 |
| False scam alarms        |       5 |
| Scams caught             |     3/3 |
| Link precision           |   38.9% |
| Link recall              |   77.8% |
| Amount exact             |   22.2% |
| Due exact                |   77.8% |
| Ask rate                 |   20.0% |
| Average cost             | $0.0004 |
| Average decision latency |  455 ms |

## Letters

| ID  | Lane      | Kind                 | Amount | Due        | Relations                                       | Asks        | Cost (µ$) | Latency (ms) |
| --- | --------- | -------------------- | -----: | ---------- | ----------------------------------------------- | ----------- | --------: | -----------: |
| L06 | handled   | statement            |   3500 | —          | —                                               | —           |       396 |          764 |
| L13 | handled   | statement            |      — | —          | —                                               | —           |       428 |          397 |
| L34 | needs_you | other                |      — | —          | same_matter→L13                                 | check       |       235 |          983 |
| L04 | needs_you | government           |      — | 2026-12-15 | —                                               | —           |       457 |          446 |
| L20 | handled   | marketing            |      — | —          | —                                               | —           |       218 |          739 |
| L01 | careful   | bill                 |      — | —          | same_matter→L04, sender_mismatch→L04            | —           |       417 |          240 |
| L15 | headsup   | bill                 |      — | 2026-12-02 | same_matter→L06                                 | link        |       484 |          232 |
| L10 | headsup   | renewal              |  41200 | 2027-01-03 | same_matter→L04                                 | link        |       494 |          792 |
| L21 | needs_you | marketing            |      — | —          | —                                               | check       |       460 |          404 |
| L12 | headsup   | renewal              |      — | 2026-12-31 | —                                               | —           |       473 |          422 |
| L23 | headsup   | appointment          |      — | 2026-12-14 | same_matter→L04                                 | link        |       373 |          416 |
| L30 | headsup   | bill                 |      — | 2026-12-12 | same_matter→L04                                 | link        |       513 |          594 |
| L19 | needs_you | other                |      — | —          | same_matter→L13                                 | link, check |       390 |          331 |
| L22 | handled   | personal             |      — | —          | —                                               | —           |       155 |          338 |
| L17 | careful   | marketing            |      — | —          | same_matter→L04, sender_mismatch→L04            | —           |       442 |          255 |
| L29 | needs_you | collection           |    250 | —          | —                                               | —           |       402 |          460 |
| L07 | handled   | statement            |   3300 | —          | same_matter→L06                                 | —           |       510 |          766 |
| L18 | careful   | marketing            |      — | —          | —                                               | —           |       291 |          236 |
| L24 | careful   | marketing            |      — | —          | —                                               | —           |       293 |          191 |
| L32 | handled   | marketing            |      — | —          | same_matter→L20                                 | link        |       220 |          646 |
| L08 | needs_you | other                |      — | —          | same_matter→L06                                 | check       |       457 |          726 |
| L25 | careful   | other                |      — | —          | same_matter→L01                                 | —           |       541 |          337 |
| L16 | —         | —                    |      — | —          | —                                               | —           |         0 |            0 |
| L05 | handled   | payment_confirmation |      — | —          | same_matter→L04, completes→L04                  | —           |       388 |          400 |
| L09 | careful   | —                    |      — | —          | same_matter→L06, sender_mismatch→L06            | —           |       443 |          311 |
| L11 | needs_you | renewal              |      — | —          | same_matter→L10                                 | check       |       486 |          993 |
| L26 | careful   | other                |      — | —          | —                                               | —           |       410 |          247 |
| L02 | needs_you | collection           |      — | 2026-12-16 | same_matter→L01, follow_up→L01, contradicts→L01 | —           |       496 |          277 |
| L28 | needs_you | personal             |      — | —          | same_matter→L22                                 | link, check |       187 |          437 |
| L03 | careful   | payment_confirmation |      — | —          | same_matter→L01                                 | paid        |       393 |          279 |

## Failures

| Letter | Reason                                                               |
| ------ | -------------------------------------------------------------------- |
| L34    | lane needs_you                                                       |
| L04    | amount mismatch                                                      |
| L01    | lane careful; false scam alarm; amount mismatch; due mismatch        |
| L15    | amount mismatch                                                      |
| L21    | lane needs_you                                                       |
| L12    | amount mismatch                                                      |
| L30    | amount mismatch                                                      |
| L24    | lane careful; false scam alarm                                       |
| L08    | lane needs_you                                                       |
| L25    | lane careful; false scam alarm                                       |
| L16    | lane missing; amount mismatch; due mismatch; missing follow_up → L15 |
| L11    | lane needs_you                                                       |
| L26    | lane careful; false scam alarm                                       |
| L02    | amount mismatch                                                      |
| L28    | lane needs_you                                                       |
| L03    | lane careful; false scam alarm; missing completes → L02              |
