# T03 RESULT — does Jev link letters well?

Run: 2026-11-24T12:22:25.748Z on Sprite `mailkeep`.

- Model: `jev-1.14.0`
- Method: exact A§9 request shape; ten typed transcripts from TESTSET; no held-out letters.
- Wording: variant 1 for `same_matter_i` — explicit underlying account/member/policy/parcel/case matching; all other questions use baseline A§9 wording.

## Rewording trials

- **Baseline A§9:** 4/6 true links. L09 `same_matter=0.780`; L25 `same_matter=0.780`. Other gate checks passed.
- **Variant 1 (winner):** 6/6 true links. L09 `same_matter=0.940`; L25 `same_matter=0.990`. L25 `follow_up=0.020`; L09 `sender_consistent=0.060`; L03 `completes=0.960`.
- **Winning instruction:** “`new` and `past[i]` concern the same underlying account, member, policy, parcel or case. Answer true when the identifiers or subject match, even if the sender name or letter kind differs; answer false for a different account or matter.”
- No second rewording was needed. The build uses variant 1.

## Gate summary

| Check                              | Result | Evidence                                                                                |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| True links `same_matter ≥ 0.85`    | PASS   | 6/6: L02 vs L01 + L25, L03 vs L02 + L01, L09 vs L06, L11 vs L10, L16 vs L15, L25 vs L01 |
| L25 is not a follow-up             | PASS   | p=0.020 < 0.80                                                                          |
| L09 sender mismatch or scam signal | PASS   | sender_consistent=0.060, max scam=0.850                                                 |
| L03 completes payment              | PASS   | p=0.960 ≥ 0.90                                                                          |

## L02 vs L01 + L25

- Model: `jev-1.14.0`
- Latency: 517 ms
- Tokens: 1984 in / 424 out
- Questions: 17

| Question              |     Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | ---------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | collection | 0.880 | 0.870 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |      0.950 | 0.950 |     — | ≥ 0.60                  | action        |
| `scam_payment`        |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_impersonation`  |      0.530 | 0.530 |     — | ≥ 0.50                  | careful       |
| `scam_secrecy`        |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `amount_due`          |         a0 | 1.000 | 1.000 | confidence ≥ 0.80       | use field     |
| `due_date`            |         d0 | 1.000 | 1.000 | confidence ≥ 0.80       | use field     |
| `same_matter_0`       |      1.000 | 1.000 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |      0.980 | 0.980 |     — | ≥ 0.80                  | reminder      |
| `completes_0`         |      0.010 | 0.010 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |      0.970 | 0.970 |     — | < 0.30 mismatch         | consistent    |
| `same_matter_1`       |      0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_1`         |      0.070 | 0.070 |     — | ≥ 0.80                  | not reminder  |
| `completes_1`         |      0.030 | 0.030 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_1` |      0.970 | 0.970 |     — | < 0.30 mismatch         | consistent    |

## L03 vs L02 + L01

- Model: `jev-1.14.0`
- Latency: 711 ms
- Tokens: 1763 in / 393 out
- Questions: 16

| Question              |               Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | -------------------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | payment_confirmation | 1.000 | 1.000 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |                0.020 | 0.020 |     — | ≥ 0.60                  | quiet         |
| `scam_payment`        |                0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |                0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_impersonation`  |                0.410 | 0.410 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |                0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |                0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `amount_due`          |                 none | 1.000 | 1.000 | confidence ≥ 0.80       | use field     |
| `same_matter_0`       |                0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |                0.110 | 0.110 |     — | ≥ 0.80                  | not reminder  |
| `completes_0`         |                0.960 | 0.960 |     — | ≥ 0.90 paid; ≥ 0.60 ask | paid signal   |
| `sender_consistent_0` |                0.940 | 0.940 |     — | < 0.30 mismatch         | consistent    |
| `same_matter_1`       |                0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_1`         |                0.090 | 0.090 |     — | ≥ 0.80                  | not reminder  |
| `completes_1`         |                0.780 | 0.780 |     — | ≥ 0.90 paid; ≥ 0.60 ask | ask paid      |
| `sender_consistent_1` |                0.940 | 0.940 |     — | < 0.30 mismatch         | consistent    |

## L09 vs L06

- Model: `jev-1.14.0`
- Latency: 656 ms
- Tokens: 1203 in / 283 out
- Questions: 11

| Question              | Answer |     p |  conf | Bar                     | Outcome      |
| --------------------- | -----: | ----: | ----: | ----------------------- | ------------ |
| `kind`                |  other | 0.580 | 0.530 | max p ≥ 0.60            | ask kind     |
| `needs_action`        |  0.790 | 0.790 |     — | ≥ 0.60                  | action       |
| `scam_payment`        |  0.020 | 0.020 |     — | ≥ 0.50                  | no hit       |
| `scam_pressure`       |  0.850 | 0.850 |     — | ≥ 0.50                  | careful      |
| `scam_impersonation`  |  0.630 | 0.630 |     — | ≥ 0.50                  | careful      |
| `scam_secrecy`        |  0.020 | 0.020 |     — | ≥ 0.50                  | no hit       |
| `scam_prize_fee`      |  0.010 | 0.010 |     — | ≥ 0.50                  | no hit       |
| `same_matter_0`       |  0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked       |
| `follow_up_0`         |  0.040 | 0.040 |     — | ≥ 0.80                  | not reminder |
| `completes_0`         |  0.010 | 0.010 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no           |
| `sender_consistent_0` |  0.060 | 0.060 |     — | < 0.30 mismatch         | mismatch     |

## L11 vs L10

- Model: `jev-1.14.0`
- Latency: 981 ms
- Tokens: 1197 in / 284 out
- Questions: 11

| Question              |  Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | ------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | renewal | 0.970 | 0.970 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |   0.190 | 0.190 |     — | ≥ 0.60                  | quiet         |
| `scam_payment`        |   0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |   0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_impersonation`  |   0.340 | 0.340 |     — | ≥ 0.50                  | no hit        |
| `scam_secrecy`        |   0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |   0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `same_matter_0`       |   1.000 | 1.000 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |   0.160 | 0.160 |     — | ≥ 0.80                  | not reminder  |
| `completes_0`         |   0.200 | 0.200 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |   0.980 | 0.980 |     — | < 0.30 mismatch         | consistent    |

## L16 vs L15

- Model: `jev-1.14.0`
- Latency: 945 ms
- Tokens: 1621 in / 345 out
- Questions: 13

| Question              |     Answer |     p |  conf | Bar                     | Outcome       |
| --------------------- | ---------: | ----: | ----: | ----------------------- | ------------- |
| `kind`                | collection | 1.000 | 1.000 | max p ≥ 0.60            | kind accepted |
| `needs_action`        |      0.870 | 0.870 |     — | ≥ 0.60                  | action        |
| `scam_payment`        |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_pressure`       |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_impersonation`  |      0.560 | 0.560 |     — | ≥ 0.50                  | careful       |
| `scam_secrecy`        |      0.020 | 0.020 |     — | ≥ 0.50                  | no hit        |
| `scam_prize_fee`      |      0.010 | 0.010 |     — | ≥ 0.50                  | no hit        |
| `amount_due`          |         a0 | 0.970 | 0.940 | confidence ≥ 0.80       | use field     |
| `due_date`            |         d0 | 0.980 | 0.960 | confidence ≥ 0.80       | use field     |
| `same_matter_0`       |      0.990 | 0.990 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked        |
| `follow_up_0`         |      0.960 | 0.960 |     — | ≥ 0.80                  | reminder      |
| `completes_0`         |      0.020 | 0.020 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no            |
| `sender_consistent_0` |      0.060 | 0.060 |     — | < 0.30 mismatch         | mismatch      |

## L25 vs L01

- Model: `jev-1.14.0`
- Latency: 803 ms
- Tokens: 1206 in / 283 out
- Questions: 11

| Question              |    Answer |     p |  conf | Bar                     | Outcome      |
| --------------------- | --------: | ----: | ----: | ----------------------- | ------------ |
| `kind`                | statement | 0.540 | 0.490 | max p ≥ 0.60            | ask kind     |
| `needs_action`        |     0.020 | 0.020 |     — | ≥ 0.60                  | quiet        |
| `scam_payment`        |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit       |
| `scam_pressure`       |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit       |
| `scam_impersonation`  |     0.380 | 0.380 |     — | ≥ 0.50                  | no hit       |
| `scam_secrecy`        |     0.020 | 0.020 |     — | ≥ 0.50                  | no hit       |
| `scam_prize_fee`      |     0.010 | 0.010 |     — | ≥ 0.50                  | no hit       |
| `same_matter_0`       |     1.000 | 1.000 |     — | ≥ 0.85 link; ≥ 0.50 ask | linked       |
| `follow_up_0`         |     0.020 | 0.020 |     — | ≥ 0.80                  | not reminder |
| `completes_0`         |     0.020 | 0.020 |     — | ≥ 0.90 paid; ≥ 0.60 ask | no           |
| `sender_consistent_0` |     0.980 | 0.980 |     — | < 0.30 mismatch         | consistent   |

## Raw response sample (first pair)

```json
{
  "model": "jev-1.14.0",
  "answers": {
    "kind": {
      "type": "choice",
      "choice": "collection",
      "confidence": 0.87,
      "probabilities": {
        "bill": 0.12,
        "statement": 0,
        "renewal": 0,
        "appointment": 0,
        "government": 0,
        "collection": 0.88,
        "payment_confirmation": 0,
        "marketing": 0,
        "personal": 0,
        "other": 0
      }
    },
    "needs_action": {
      "type": "noul",
      "noul": 0.95
    },
    "scam_payment": {
      "type": "noul",
      "noul": 0.02
    },
    "scam_pressure": {
      "type": "noul",
      "noul": 0.02
    },
    "scam_impersonation": {
      "type": "noul",
      "noul": 0.53
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
      "noul": 0.98
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
      "noul": 0.07
    },
    "completes_1": {
      "type": "noul",
      "noul": 0.03
    },
    "sender_consistent_1": {
      "type": "noul",
      "noul": 0.97
    }
  },
  "usage": {
    "input_tokens": 1984,
    "output_tokens": 424
  }
}
```
