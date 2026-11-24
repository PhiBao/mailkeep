# T03 RESULT — does Jev link letters well?

Run: 2026-11-24T20:52:11.220Z on Sprite `mailkeep`.

- Model: `jev-1.14.0`
- Method: exact A§9 request shape; ten typed transcripts from TESTSET; no held-out letters.
- Wording: variant 2 for `same_matter_i` — distinctive identifier or same specific obligation with the same organisation; generic subjects do not count. T17 narrows action/field wording and retires the unreliable government-impersonation question; explicit scam rules and sender mismatch remain.

## Rewording trials

- **Baseline A§9:** 4/6 true links; L09 and L25 `same_matter=0.780`.
- **Variant 1:** 6/6 true links, but the first full eval showed false links between unrelated generic letters.
- **Variant 2 (current):** 6/6 true links; no third same-matter rewording was used.

## Gate summary

| Check                              | Result | Evidence                                                                                |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| True links `same_matter ≥ 0.85`    | PASS   | 6/6: L02 vs L01 + L25, L03 vs L02 + L01, L09 vs L06, L11 vs L10, L16 vs L15, L25 vs L01 |
| L25 is not a follow-up             | PASS   | p=0.030 < 0.80                                                                          |
| L09 sender mismatch or scam signal | PASS   | sender_consistent=0.050, max scam=0.910                                                 |
| L03 completes payment              | PASS   | p=0.970 ≥ 0.90                                                                          |

## L02 vs L01 + L25

- Model: `jev-1.14.0`
- Latency: 376 ms
- Tokens: 2185 in / 403 out
- Questions: 16

| Question              |     Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | ---------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | collection | 0.830 | 0.810 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |      0.990 | 0.990 |     — | ≥ 0.60                  | action        |
| `scam_payment`        |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `amount_due`          |         a0 | 1.000 | 1.000 | confidence ≥ 0.70       | use field     |
| `due_date`            |         d0 | 1.000 | 1.000 | confidence ≥ 0.70       | use field     |
| `same_matter_0`       |      1.000 | 1.000 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |      0.990 | 0.990 |     — | ≥ 0.80                  | reminder      |
| `completes_0`         |      0.010 | 0.010 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |      0.970 | 0.970 |     — | < 0.30 mismatch         | consistent    |
| `same_matter_1`       |      0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_1`         |      0.040 | 0.040 |     — | ≥ 0.80                  | not reminder  |
| `completes_1`         |      0.030 | 0.030 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_1` |      0.980 | 0.980 |     — | < 0.30 mismatch         | consistent    |

## L03 vs L02 + L01

- Model: `jev-1.14.0`
- Latency: 294 ms
- Tokens: 1934 in / 372 out
- Questions: 15

| Question              |               Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | -------------------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | payment_confirmation | 1.000 | 1.000 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |                0.020 | 0.020 |     — | ≥ 0.60                  | quiet         |
| `scam_payment`        |                0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |                0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |                0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |                0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `amount_due`          |                 none | 1.000 | 1.000 | confidence ≥ 0.70       | use field     |
| `same_matter_0`       |                0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |                0.100 | 0.100 |     — | ≥ 0.80                  | not reminder  |
| `completes_0`         |                0.970 | 0.970 |     — | ≥ 0.90 paid; ≥ 0.60 ask | paid signal   |
| `sender_consistent_0` |                0.940 | 0.940 |     — | < 0.30 mismatch         | consistent    |
| `same_matter_1`       |                0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_1`         |                0.090 | 0.090 |     — | ≥ 0.80                  | not reminder  |
| `completes_1`         |                0.790 | 0.790 |     — | ≥ 0.90 paid; ≥ 0.60 ask | ask paid      |
| `sender_consistent_1` |                0.950 | 0.950 |     — | < 0.30 mismatch         | consistent    |

## L09 vs L06

- Model: `jev-1.14.0`
- Latency: 204 ms
- Tokens: 1291 in / 262 out
- Questions: 10

| Question              | Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | -----: | ----: | ----: | ----------------------- | ------------- |
| `kind`                |  other | 0.650 | 0.610 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |  0.940 | 0.940 |     — | ≥ 0.60                  | action        |
| `scam_payment`        |  0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |  0.910 | 0.910 |     — | ≥ 0.50                  | careful       |
| `scam_secrecy`        |  0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |  0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `same_matter_0`       |  0.980 | 0.980 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |  0.040 | 0.040 |     — | ≥ 0.80                  | not reminder  |
| `completes_0`         |  0.010 | 0.010 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |  0.050 | 0.050 |     — | < 0.30 mismatch         | mismatch      |

## L11 vs L10

- Model: `jev-1.14.0`
- Latency: 1127 ms
- Tokens: 1285 in / 262 out
- Questions: 10

| Question              |    Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | --------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | statement | 0.950 | 0.940 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |     0.210 | 0.210 |     — | ≥ 0.60                  | quiet         |
| `scam_payment`        |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `same_matter_0`       |     0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |     0.230 | 0.230 |     — | ≥ 0.80                  | not reminder  |
| `completes_0`         |     0.190 | 0.190 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |     0.980 | 0.980 |     — | < 0.30 mismatch         | consistent    |

## L16 vs L15

- Model: `jev-1.14.0`
- Latency: 330 ms
- Tokens: 1785 in / 324 out
- Questions: 12

| Question              |     Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | ---------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | collection | 1.000 | 1.000 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |      0.950 | 0.950 |     — | ≥ 0.60                  | action        |
| `scam_payment`        |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |      0.030 | 0.030 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `amount_due`          |         a0 | 0.630 | 0.260 | confidence ≥ 0.70       | do not use    |
| `due_date`            |         d0 | 0.970 | 0.940 | confidence ≥ 0.70       | use field     |
| `same_matter_0`       |      0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |      0.960 | 0.960 |     — | ≥ 0.80                  | reminder      |
| `completes_0`         |      0.020 | 0.020 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |      0.060 | 0.060 |     — | < 0.30 mismatch         | mismatch      |

## L25 vs L01

- Model: `jev-1.14.0`
- Latency: 1142 ms
- Tokens: 1294 in / 262 out
- Questions: 10

| Question              |    Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | --------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | statement | 1.000 | 1.000 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |     0.020 | 0.020 |     — | ≥ 0.60                  | quiet         |
| `scam_payment`        |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |     0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `same_matter_0`       |     0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |     0.030 | 0.030 |     — | ≥ 0.80                  | not reminder  |
| `completes_0`         |     0.020 | 0.020 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |     0.970 | 0.970 |     — | < 0.30 mismatch         | consistent    |

## Raw response sample (first pair)

```json
{
  "model": "jev-1.14.0",
  "answers": {
    "kind": {
      "type": "choice",
      "choice": "collection",
      "confidence": 0.81,
      "probabilities": {
        "bill": 0.17,
        "statement": 0,
        "renewal": 0,
        "appointment": 0,
        "government": 0,
        "collection": 0.83,
        "payment_confirmation": 0,
        "marketing": 0,
        "personal": 0,
        "other": 0
      }
    },
    "needs_action": {
      "type": "noul",
      "noul": 0.99
    },
    "scam_payment": {
      "type": "noul",
      "noul": 0.01
    },
    "scam_pressure": {
      "type": "noul",
      "noul": 0.02
    },
    "scam_secrecy": {
      "type": "noul",
      "noul": 0.01
    },
    "scam_prize_fee": {
      "type": "noul",
      "noul": 0.01
    },
    "amount_due": {
      "type": "choice",
      "choice": "a0",
      "confidence": 1,
      "probabilities": {
        "a0": 1,
        "none": 0
      }
    },
    "due_date": {
      "type": "choice",
      "choice": "d0",
      "confidence": 1,
      "probabilities": {
        "d0": 1,
        "none": 0
      }
    },
    "same_matter_0": {
      "type": "noul",
      "noul": 1
    },
    "follow_up_0": {
      "type": "noul",
      "noul": 0.99
    },
    "completes_0": {
      "type": "noul",
      "noul": 0.01
    },
    "sender_consistent_0": {
      "type": "noul",
      "noul": 0.97
    },
    "same_matter_1": {
      "type": "noul",
      "noul": 0.99
    },
    "follow_up_1": {
      "type": "noul",
      "noul": 0.04
    },
    "completes_1": {
      "type": "noul",
      "noul": 0.03
    },
    "sender_consistent_1": {
      "type": "noul",
      "noul": 0.98
    }
  },
  "usage": {
    "input_tokens": 2185,
    "output_tokens": 403
  }
}
```
