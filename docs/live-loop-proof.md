# Live inbound-to-Box proof

Verified 2026-11-25 against `https://mailkeep-hl3m.sprites.app` on commit `60365e4330869a62589278590602b44673c6fb31`.

This proof used the real Gmail → AgentMail → Sprite pipeline, real model/provider calls, real outbound AgentMail email and the household's real Box folder. It did not use a demo fixture, a simulated provider response or a held-out evaluation letter. The only synthetic element was the Cedar Valley Water Utility account `7782`, chosen to avoid deduplicating against the existing Riverbend case.

## 1. Inbound bill and uncertain link

- Sent from `kiter7396@gmail.com` to `kiter@agentmail.to` with the Cedar bill photo attached.
- Inbound AgentMail message: `<CAF5wXnKwPQeqSt+0_R8C5NPwG1=pCThkGGJdSxVNVKSP7qf9nQ@mail.gmail.com>`.
- Letter: `ltr_rK6WD0pwwar4ByLWmqZpW`, title **November Water Bill**, Cedar account tail `7782`, due `2026-11-20`.
- Case: `case_gOUym0iTJkMowaOOuWbi5`, Box folder `440968887843`, Box case file `2613910293414`.
- Parent note: `out_APeLjmfWS6HnmoBwJt-pz`, sent to `kiter7396+mom@gmail.com`.
- Pinecone surfaced Riverbend at `same_matter=0.51`, below the frozen `0.85` link threshold. Mailkeep asked instead of linking: `ask_k_A-1KGlepzmLZI-d3sa0` on thread `1ab74f75-bdb4-41cd-a4f7-2818af744ec4`.
- An exact `NO` reply was recorded with `answer_key=no`, `answered_via=email`, and the Riverbend relation remained `rejected`. Cedar stayed a separate case.

Two earlier `NO` attempts were classified unclear before T48 deployed because AgentMail's list response omitted the reply body. T48 added detail-message hydration and localized-quote handling. The successful exact reply was `<CAF5wXnLaXRqeTKOYtgWCQqyuu-+gDnWc8FNkVbSsEbBrnfYWBg@mail.gmail.com>`.

## 2. Second notice and family alert

- Sent a second Cedar notice photo from `kiter7396@gmail.com` to `kiter@agentmail.to`.
- Inbound AgentMail message: `<CAF5wXnKhLqxcBz6KdLxon4Q+d+YKhVxtYoq5J8KuvP9-wfhRHQ@mail.gmail.com>`.
- Letter: `ltr__s279qGwwCDmj_vShLaaz`, title **Past Due Water Bill Notice**, due `2026-12-02`.
- The letter linked to the existing Cedar case. The case became kind `collection`, due `2026-12-02`, with `second_notice=1`.
- Parent note: `out_Xb2-ORBrfoa-_Z5x5Nmpi`, sent to `kiter7396+mom@gmail.com`.
- Family alert: `out_M3qqunAoQuLhmy0XU59p6`, sent to `kiter7396@gmail.com` on thread `8c56c267-6c36-42a3-add7-8571b03f5a3f`.
- Alert subject: **Second notice: Cedar Valley Water Utility collection — nobody marked it paid**.
- Alert body instructs the family to **Reply PAID** if the bill was paid.

## 3. Exact PAID reply and Box update

- Replied with exactly `PAID` from `kiter7396@gmail.com` on the Cedar family-alert thread.
- Reply AgentMail message: `<CAF5wXnL6-gBe=q7EiRbCy_f8svdnLEs9tYi7JfWQrBy-BDnAFQ@mail.gmail.com>`.
- `inbound_seen` outcome: `answered` at `2026-11-25T09:21:42.221Z`.
- Cedar case `case_gOUym0iTJkMowaOOuWbi5` changed from `open` to `paid` at `2026-11-25T09:21:43.307Z`.
- The second-notice letter changed to lane `handled`.
- The existing Riverbend paid case was not changed or reused.
- Box accepted a new version upload for the same `case.md` file `2613910293414`.
- Current Box file version: `2902183475476`, SHA-1 `658b7c62ff7aade46e60a1bb3a11fbfb361e9f2d`, sequence/etag `4`.
- Current Box content includes `Status: paid`, `Second notice: yes`, both Cedar letter IDs and `2026-11-25T09:21:43.307Z · marked_paid · member`.

The Box gateway permits reading current file metadata and content but denies the versions-list endpoint (`403`). The new-version evidence is therefore the successful `POST /upload/files/2613910293414/content` returning `201`, followed by the updated file version, content and modification time.

## Residual proof notes

- One cold-start webhook request returned `502`; `/healthz` returned `200`, and the immediate retry returned `202` and processed normally.
- The pre-T48 failed clarification outbox row `out_vok-OqDrAP3d6ZO6eYBlg` remains as historical evidence. It did not block the successful fresh `NO` reply.
- Public Box sharing remains blocked until the founder shares the demo folder. This proof used the household's private Box folder.
- No social post, form submission or email outside the three permitted addresses was created. The 79.89-second demo video and voiceover were produced separately after this proof.
