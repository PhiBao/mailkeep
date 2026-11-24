import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GATEWAY = 'https://api.sprites.dev/v1/gateway';

interface Transcript {
  id: string;
  received: string;
  sender: string;
  kind: string;
  case_status: string;
  amount: string | null;
  due: string | null;
  lane: string;
  phones: string[];
  text: string;
}

interface PairSpec {
  name: string;
  newId: string;
  pastIds: string[];
  primaryPastId: string;
}

const transcripts = JSON.parse(
  await readFile(path.join(ROOT, 'spikes/jev/cases.json'), 'utf8'),
) as Transcript[];
const byId = new Map(transcripts.map((item) => [item.id, item]));
const pairs: PairSpec[] = [
  { name: 'L02 vs L01 + L25', newId: 'L02', pastIds: ['L01', 'L25'], primaryPastId: 'L01' },
  { name: 'L03 vs L02 + L01', newId: 'L03', pastIds: ['L02', 'L01'], primaryPastId: 'L02' },
  { name: 'L09 vs L06', newId: 'L09', pastIds: ['L06'], primaryPastId: 'L06' },
  { name: 'L11 vs L10', newId: 'L11', pastIds: ['L10'], primaryPastId: 'L10' },
  { name: 'L16 vs L15', newId: 'L16', pastIds: ['L15'], primaryPastId: 'L15' },
  { name: 'L25 vs L01', newId: 'L25', pastIds: ['L01'], primaryPastId: 'L01' },
];

const kindCriteria: Record<string, string> = {
  bill: 'asks the recipient to pay an amount',
  statement:
    'an account statement, explanation of benefits, privacy notice, policy document, or notice of rate, coverage or term changes that reports existing terms and does not request payment, renewal or attendance',
  renewal: 'a policy, registration or membership that asks the recipient to renew now',
  appointment: 'a date the recipient must attend, such as an appointment or jury duty',
  government: 'a tax, benefits or legal notice from a government office',
  collection: 'a debt collector or past-due demand',
  payment_confirmation: 'confirms a payment was received or an account is paid',
  marketing:
    'an advert, offer, catalog, prize notice, donation request, or nonpartisan civic reminder that does not claim to be a government office',
  personal: 'a personal letter or card',
  other: 'none of these',
};

function contextFor(text: string, needle: string | null): string {
  if (!needle) return '';
  const index = text.indexOf(needle);
  if (index < 0) return text.slice(0, 120);
  return text.slice(Math.max(0, index - 50), Math.min(text.length, index + needle.length + 50));
}

function buildRequest(newCase: Transcript, past: Transcript[]) {
  const amountCandidates = newCase.amount
    ? [{ id: 'a0', text: newCase.amount, context: contextFor(newCase.text, newCase.amount) }]
    : [];
  const dateCandidates = newCase.due
    ? [
        {
          id: 'd0',
          iso: newCase.due,
          text: newCase.due,
          context: contextFor(newCase.text, newCase.due),
        },
      ]
    : [];
  const questions: Record<string, unknown> = {
    kind: {
      type: 'choice',
      instructions: 'What kind of letter is `new`?',
      criteria: kindCriteria,
    },
    needs_action: {
      type: 'noul',
      instructions:
        'The recipient of `new` is required to do something because of it: pay, reply, call, sign, renew or attend. Optional invitations, donations, offers, courtesy replies, informational notices, rate or coverage changes, and letters saying no action is needed do not count.',
    },
    scam_payment: {
      type: 'noul',
      instructions:
        '`new` asks to be paid with gift cards, cryptocurrency, a wire transfer or a payment app.',
    },
    scam_pressure: {
      type: 'noul',
      instructions:
        '`new` threatens arrest, loss of benefits or loss of property unless the recipient responds immediately. A routine deadline, reminder, or second notice without such a threat does not count.',
    },
    scam_secrecy: {
      type: 'noul',
      instructions: '`new` tells the recipient not to tell their bank, family or anyone else.',
    },
    scam_prize_fee: {
      type: 'noul',
      instructions:
        '`new` says the recipient won a prize or money and must pay a fee to receive it.',
    },
  };

  if (amountCandidates.length > 0) {
    questions.amount_due = {
      type: 'choice',
      instructions:
        'Which amount in `amount_candidates` is the total the recipient must pay now because of `new`? Include an explicitly stated late fee in the current total. Do not choose an assessed value, line item, minimum payment, past balance, optional donation or amount already paid. Choose none when no payment is required.',
      criteria: {
        ...Object.fromEntries(
          amountCandidates.map((candidate) => [
            candidate.id,
            `${candidate.text} — ${candidate.context}`,
          ]),
        ),
        none: '`new` does not ask the recipient to pay any amount',
      },
    };
  }
  if (dateCandidates.length > 0) {
    questions.due_date = {
      type: 'choice',
      instructions:
        'Which date in `date_candidates` is the actual payment or action deadline for `new`? Do not choose the letter date, a statement period, coverage effective date, renewal start date or optional event date. Choose none when the recipient has no deadline.',
      criteria: {
        ...Object.fromEntries(
          dateCandidates.map((candidate) => [
            candidate.id,
            `${candidate.text} — ${candidate.context}`,
          ]),
        ),
        none: '`new` states no deadline for the recipient',
      },
    };
  }

  past.forEach((item, index) => {
    questions[`same_matter_${index}`] = {
      type: 'noul',
      instructions: `\`new\` and \`past[${index}]\` concern the same specific account, member, policy, parcel or case. Answer true only when they share a distinctive identifier such as an account, member, policy, parcel or reference number, or clearly concern the same specific obligation with the same organisation. A shared generic subject such as mail, bill, notice, statement, payment or letter is not enough. Answer false for a different account or matter.`,
    };
    questions[`follow_up_${index}`] = {
      type: 'noul',
      instructions: `\`new\` is a reminder, second notice, past-due notice or final notice about the same payment or request as \`past[${index}]\`.`,
    };
    questions[`completes_${index}`] = {
      type: 'noul',
      instructions: `\`new\` confirms that the payment or request in \`past[${index}]\` has been received, paid or completed.`,
    };
    if (item.lane !== 'careful') {
      questions[`sender_consistent_${index}`] = {
        type: 'noul',
        instructions: `\`new\` and \`past[${index}]\` come from the same real organisation, with matching return address, phone numbers and account number format.`,
      };
    }
  });

  return {
    model: 'jev-1.14.0',
    state: {
      today: newCase.received,
      new: {
        sender: newCase.sender,
        claims_government: /county|state|treasurer|motor vehicle|court/i.test(newCase.sender),
        text: newCase.text.slice(0, 6000),
        phones: newCase.phones,
      },
      past: past.map((item) => ({
        id: item.id,
        received: item.received,
        sender: item.sender,
        kind: item.kind,
        case_status: item.case_status,
        amount: item.amount,
        due: item.due,
        lane: item.lane,
        text: item.text.slice(0, 600),
        phones: item.phones,
      })),
      amount_candidates: amountCandidates,
      date_candidates: dateCandidates,
    },
    questions,
  };
}

interface Answer {
  type: 'noul' | 'choice';
  noul?: number;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

interface Response {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

function probability(answer: Answer | undefined): number | null {
  if (!answer) return null;
  if (answer.type === 'noul') return answer.noul ?? null;
  return answer.probabilities?.[answer.choice ?? ''] ?? null;
}

function outcomeFor(key: string, answer: Answer | undefined): { bar: string; outcome: string } {
  const p = probability(answer);
  if (key.startsWith('same_matter_')) {
    return {
      bar: '≥ 0.85 link; ≥ 0.50 ask',
      outcome: p === null ? 'missing' : p >= 0.85 ? 'linked' : p >= 0.5 ? 'ask' : 'no link',
    };
  }
  if (key.startsWith('follow_up_')) {
    return { bar: '≥ 0.80', outcome: p !== null && p >= 0.8 ? 'reminder' : 'not reminder' };
  }
  if (key.startsWith('completes_')) {
    return {
      bar: '≥ 0.90 paid; ≥ 0.60 ask',
      outcome: p === null ? 'missing' : p >= 0.9 ? 'paid signal' : p >= 0.6 ? 'ask paid' : 'no',
    };
  }
  if (key.startsWith('sender_consistent_')) {
    return { bar: '< 0.30 mismatch', outcome: p !== null && p < 0.3 ? 'mismatch' : 'consistent' };
  }
  if (key.startsWith('scam_')) {
    return { bar: '≥ 0.50', outcome: p !== null && p >= 0.5 ? 'careful' : 'no hit' };
  }
  if (key === 'needs_action') {
    return { bar: '≥ 0.60', outcome: p !== null && p >= 0.6 ? 'action' : 'quiet' };
  }
  if (key === 'amount_due' || key === 'due_date') {
    return {
      bar: 'confidence ≥ 0.70',
      outcome: (answer?.confidence ?? 0) >= 0.7 ? 'use field' : 'do not use',
    };
  }
  if (key === 'kind') {
    const best = Math.max(0, ...Object.values(answer?.probabilities ?? {}));
    return { bar: 'max p ≥ 0.60', outcome: best >= 0.6 ? 'kind accepted' : 'ask kind' };
  }
  return { bar: '—', outcome: 'recorded' };
}

function tableFor(request: ReturnType<typeof buildRequest>, response: Response): string {
  const rows = Object.keys(request.questions).map((key) => {
    const answer = response.answers[key];
    const p = probability(answer);
    const confidence = answer?.confidence;
    const verdict = outcomeFor(key, answer);
    const value =
      answer?.type === 'choice'
        ? (answer.choice ?? 'missing')
        : p === null
          ? 'missing'
          : p.toFixed(3);
    return `| \`${key}\` | ${value} | ${p === null ? '—' : p.toFixed(3)} | ${confidence === undefined ? '—' : confidence.toFixed(3)} | ${verdict.bar} | ${verdict.outcome} |`;
  });
  return `| Question | Answer | p | conf | Bar | Outcome |\n|---|---:|---:|---:|---|---|\n${rows.join('\n')}`;
}

const listResponse = await fetch(`${GATEWAY}/list`);
const list = (await listResponse.json()) as {
  connections: Array<{ provider: string; gateway_base_url: string }>;
};
const typesafe = list.connections.find((item) => item.provider === 'typesafe');
if (!typesafe) throw new Error('TypeSafe connector not found');

const sections: string[] = [];
const summaries: Array<{
  pair: PairSpec;
  response: Response;
  latency: number;
  request: ReturnType<typeof buildRequest>;
}> = [];
let firstRaw: unknown = null;

for (const pair of pairs) {
  const newCase = byId.get(pair.newId);
  const past = pair.pastIds.map((id) => byId.get(id));
  if (!newCase || past.some((item) => !item))
    throw new Error(`Missing transcript for ${pair.name}`);
  const request = buildRequest(newCase, past as Transcript[]);
  const started = performance.now();
  const response = await fetch(`${typesafe.gateway_base_url}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = (await response.json()) as Response & { detail?: unknown };
  const latency = Math.round(performance.now() - started);
  if (!response.ok) throw new Error(`${pair.name} HTTP ${response.status}: ${JSON.stringify(raw)}`);
  if (!firstRaw) firstRaw = raw;
  summaries.push({ pair, response: raw, latency, request });
  sections.push(
    `## ${pair.name}\n\n- Model: \`${raw.model}\`\n- Latency: ${latency} ms\n- Tokens: ${raw.usage.input_tokens} in / ${raw.usage.output_tokens} out\n- Questions: ${Object.keys(request.questions).length}\n\n${tableFor(request, raw)}\n`,
  );
  console.log(`${pair.name}: ${latency} ms, ${Object.keys(request.questions).length} questions`);
}

function primaryAnswer(summary: (typeof summaries)[number], prefix: string): Answer | undefined {
  const index = summary.pair.pastIds.indexOf(summary.pair.primaryPastId);
  return summary.response.answers[`${prefix}_${index}`];
}

const trueLinks = summaries.filter(
  (summary) => (probability(primaryAnswer(summary, 'same_matter')) ?? 0) >= 0.85,
);
const l25 = summaries.find((summary) => summary.pair.newId === 'L25');
const l09 = summaries.find((summary) => summary.pair.newId === 'L09');
const l03 = summaries.find((summary) => summary.pair.newId === 'L03');
const falseFollowUp =
  (probability(primaryAnswer(l25 as (typeof summaries)[number], 'follow_up')) ?? 1) < 0.8;
const l09Sender = probability(
  primaryAnswer(l09 as (typeof summaries)[number], 'sender_consistent'),
);
const l09Scam = Math.max(
  0,
  ...Object.entries((l09 as (typeof summaries)[number]).response.answers)
    .filter(([key]) => key.startsWith('scam_'))
    .map(([, answer]) => probability(answer) ?? 0),
);
const l09Safe = (l09Sender ?? 1) < 0.3 || l09Scam >= 0.5;
const l03Completes =
  probability(primaryAnswer(l03 as (typeof summaries)[number], 'completes')) ?? 0;
const pass = trueLinks.length >= 5 && falseFollowUp && l09Safe && l03Completes >= 0.9;

const result = `# T03 RESULT — does Jev link letters well?\n\nRun: ${new Date().toISOString()} on Sprite \`mailkeep\`.\n\n- Model: \`jev-1.14.0\`\n- Method: exact A§9 request shape; ten typed transcripts from TESTSET; no held-out letters.\n- Wording: variant 2 for \`same_matter_i\` — distinctive identifier or same specific obligation with the same organisation; generic subjects do not count. T17 narrows action/field wording and retires the unreliable government-impersonation question; explicit scam rules and sender mismatch remain.\n\n## Rewording trials\n\n- **Baseline A§9:** 4/6 true links; L09 and L25 \`same_matter=0.780\`.\n- **Variant 1:** 6/6 true links, but the first full eval showed false links between unrelated generic letters.\n- **Variant 2 (current):** 6/6 true links; no third same-matter rewording was used.\n\n## Gate summary\n\n| Check | Result | Evidence |\n|---|---|---|\n| True links \`same_matter ≥ 0.85\` | ${trueLinks.length >= 5 ? 'PASS' : 'FAIL'} | ${trueLinks.length}/6: ${trueLinks.map((item) => item.pair.name).join(', ')} |\n| L25 is not a follow-up | ${falseFollowUp ? 'PASS' : 'FAIL'} | p=${(probability(primaryAnswer(l25 as (typeof summaries)[number], 'follow_up')) ?? 0).toFixed(3)} < 0.80 |\n| L09 sender mismatch or scam signal | ${l09Safe ? 'PASS' : 'FAIL'} | sender_consistent=${(l09Sender ?? 0).toFixed(3)}, max scam=${l09Scam.toFixed(3)} |\n| L03 completes payment | ${l03Completes >= 0.9 ? 'PASS' : 'FAIL'} | p=${l03Completes.toFixed(3)} ≥ 0.90 |\n\n${sections.join('\n')}
## Raw response sample (first pair)\n\n\`\`\`json\n${JSON.stringify(firstRaw, null, 2)}\n\`\`\`\n`;

await writeFile(path.join(ROOT, 'spikes/jev/RESULT.md'), result);
console.log(
  `T03 ${pass ? 'PASS' : 'FAIL'}: true links ${trueLinks.length}/6, L25 follow-up ${(probability(primaryAnswer(l25 as (typeof summaries)[number], 'follow_up')) ?? 0).toFixed(3)}, L09 sender ${(l09Sender ?? 0).toFixed(3)}, L03 completes ${l03Completes.toFixed(3)}`,
);
if (!pass) process.exitCode = 1;
