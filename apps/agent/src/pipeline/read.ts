import { z } from 'zod';
import type { GatewayClient } from '../gateway/client.js';
import { chat } from '../providers/ollama.js';
import { firstLines } from '../util/text.js';
import { amountCandidates, dateCandidates, phoneCandidates } from './candidates.js';
import { measureQuality } from './quality.js';
import { redact } from './redact.js';
import { type ScamRule, scamRuleHits } from './scamrules.js';

export const R1_PROMPT =
  'Transcribe every word exactly as printed, line by line. Copy names, dates, amounts and phone numbers exactly. Write [unreadable] for anything you cannot read. No commentary.';

const summarySchema = z.object({
  sender_org: z.string().nullable(),
  claims_government: z.boolean(),
  title: z.string().min(1).max(80),
  summary_parent: z.string().min(1),
  todo_parent: z.string().nullable(),
});

export interface ReadResult {
  transcript: string;
  accountTail: string | null;
  senderOrg: string | null;
  claimsGovernment: boolean;
  title: string;
  summaryParent: string;
  todoParent: string | null;
  amounts: ReturnType<typeof amountCandidates>;
  dates: ReturnType<typeof dateCandidates>;
  phones: ReturnType<typeof phoneCandidates>;
  scamRuleHits: ScamRule[];
  needsRetake: boolean;
  qualityFlagged: boolean;
  r2Failed: boolean;
  promptTokens: number;
  outputTokens: number;
}

function summaryPrompt(transcript: string, today: string): string {
  return `Today is ${today}. Read the redacted letter transcript below. Return JSON only with exactly this shape:\n{"sender_org": string|null, "claims_government": boolean, "title": string (6 words or fewer), "summary_parent": string (2 to 4 short sentences in plain English, no jargon), "todo_parent": string|null}\nDo not invent facts. Do not ask for or return amounts, dates, account numbers or phone numbers; code handles those. If there is nothing for the parent to do, todo_parent is null.\n\nTranscript:\n${transcript}`;
}

async function requestSummary(
  client: GatewayClient,
  model: string,
  transcript: string,
  today: string,
): Promise<{
  value: z.infer<typeof summarySchema>;
  failed: boolean;
  promptTokens: number;
  outputTokens: number;
}> {
  let lastError = '';
  let promptTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? summaryPrompt(transcript, today)
        : `${summaryPrompt(transcript, today)}\n\nThe previous response failed validation: ${lastError}. Return corrected JSON only.`;
    const result = await chat(client, { model, messages: [{ role: 'user', content: prompt }] });
    promptTokens += result.promptTokens;
    outputTokens += result.outputTokens;
    try {
      return {
        value: summarySchema.parse(JSON.parse(result.content)),
        failed: false,
        promptTokens,
        outputTokens,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    value: {
      sender_org: null,
      claims_government: false,
      title: 'Letter',
      summary_parent: firstLines(transcript, 2) || 'Mailkeep could not summarise this letter.',
      todo_parent: null,
    },
    failed: true,
    promptTokens,
    outputTokens,
  };
}

async function readTranscript(
  client: GatewayClient,
  input: {
    rawTranscript: string;
    model: string;
    today: string;
    promptTokens?: number;
    outputTokens?: number;
    qualityFlagged?: boolean;
  },
): Promise<ReadResult> {
  const redacted = redact(input.rawTranscript);
  const summary = await requestSummary(client, input.model, redacted.text, input.today);
  const words = redacted.text.trim().split(/\s+/).filter(Boolean);
  const unreadable = redacted.text.match(/\[unreadable\]/gi)?.length ?? 0;
  return {
    transcript: redacted.text,
    accountTail: redacted.accountTail,
    senderOrg: summary.value.sender_org,
    claimsGovernment: summary.value.claims_government,
    title: summary.value.title,
    summaryParent: summary.value.summary_parent,
    todoParent: summary.value.todo_parent,
    amounts: amountCandidates(redacted.text),
    dates: dateCandidates(redacted.text),
    phones: phoneCandidates(redacted.text),
    scamRuleHits: scamRuleHits(redacted.text),
    needsRetake: unreadable >= 3 || words.length < 15,
    qualityFlagged: input.qualityFlagged ?? false,
    r2Failed: summary.failed,
    promptTokens: (input.promptTokens ?? 0) + summary.promptTokens,
    outputTokens: (input.outputTokens ?? 0) + summary.outputTokens,
  };
}

export async function readLetterText(
  client: GatewayClient,
  input: { text: string; model: string; today: string },
): Promise<ReadResult> {
  return readTranscript(client, { ...input, rawTranscript: input.text });
}

export async function readLetterImage(
  client: GatewayClient,
  input: { bytes: Buffer; model: string; today: string },
): Promise<ReadResult> {
  const transcription = await chat(client, {
    model: input.model,
    messages: [{ role: 'user', content: R1_PROMPT, images: [input.bytes.toString('base64')] }],
  });
  const quality = await measureQuality(input.bytes);
  return readTranscript(client, {
    rawTranscript: transcription.content,
    model: input.model,
    today: input.today,
    promptTokens: transcription.promptTokens,
    outputTokens: transcription.outputTokens,
    qualityFlagged: quality.flagged,
  });
}
