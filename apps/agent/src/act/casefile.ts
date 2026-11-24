import type { RouteCheck } from '../pipeline/route.js';

export interface CaseFileInput {
  title: string;
  counterparty: string;
  kind: string;
  status: string;
  amountCents: number | null;
  dueDate: string | null;
  secondNotice: boolean;
  contradiction: boolean;
  events: Array<{ createdAt: string; type: string; actor: string }>;
  letterIds: string[];
  modelIds: string[];
  updatedAt: string;
}

export interface LetterFileInput {
  title: string;
  receivedAt: string;
  lane: string;
  summaryParent: string;
  todoParent: string | null;
  transcript: string;
  checks: RouteCheck[];
  modelIds: string[];
}

export function renderCaseFile(input: CaseFileInput): string {
  return `# ${input.title}\n\n- Status: ${input.status}\n- Counterparty: ${input.counterparty}\n- Kind: ${input.kind}\n- Amount: ${input.amountCents === null ? 'none' : `$${(input.amountCents / 100).toFixed(2)}`}\n- Due: ${input.dueDate ?? 'none'}\n- Second notice: ${input.secondNotice ? 'yes' : 'no'}\n- Contradiction: ${input.contradiction ? 'yes' : 'no'}\n\n## Timeline\n\n${input.events.map((event) => `- ${event.createdAt} · ${event.type} · ${event.actor}`).join('\n')}\n\n## Letters\n\n${input.letterIds.map((letterId) => `- ${letterId}`).join('\n')}\n\n## Models\n\n${input.modelIds.map((modelId) => `- ${modelId}`).join('\n')}\n\nLast updated: ${input.updatedAt}\n\nWritten by Mailkeep — edits here are not read back.\n`;
}

export function renderLetterFile(input: LetterFileInput): string {
  return `# ${input.title}\n\n- Received: ${input.receivedAt}\n- Lane: ${input.lane}\n- Summary: ${input.summaryParent}\n- To do: ${input.todoParent ?? 'Nothing'}\n\n## Redacted transcript\n\n${input.transcript}\n\n## Checks\n\n| Question | Answer | p | confidence | Bar | Outcome |\n|---|---|---:|---:|---:|---|\n${input.checks.map((check) => `| ${check.key} | ${check.answer} | ${check.probability?.toFixed(2) ?? '—'} | ${check.confidence?.toFixed(2) ?? '—'} | ${check.threshold ?? '—'} | ${check.outcome} |`).join('\n')}\n\n## Models\n\n${input.modelIds.map((modelId) => `- ${modelId}`).join('\n')}\n`;
}
