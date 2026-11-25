import { z } from 'zod';
import {
  ASK_TYPES,
  CASE_STATUSES,
  KINDS,
  LANES,
  LETTER_SOURCES,
  LETTER_STATUSES,
  OUTBOX_KINDS,
  OUTBOX_STATUSES,
  QUESTION_TYPES,
  RELATIONS,
} from './types.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime({ offset: true });
const nullableString = z.string().nullable();
const nullableDate = isoDate.nullable();
const nullableCents = z.number().int().nullable();

export const householdSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentDisplay: z.string(),
  timezone: z.string(),
  isDemo: z.boolean(),
  today: isoDate,
});

export const askOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const askSchema = z.object({
  id: z.string(),
  letterId: nullableString,
  caseId: nullableString,
  qtype: z.enum(ASK_TYPES),
  question: z.string(),
  evidence: z.string(),
  options: z.array(askOptionSchema),
  status: z.enum(['open', 'answered', 'expired']),
  createdAt: isoDateTime,
  letterTitle: z.string(),
});

export const dueLineSchema = z.object({
  caseId: z.string(),
  title: z.string(),
  counterparty: z.string(),
  kind: z.enum(KINDS),
  status: z.enum(CASE_STATUSES),
  amountCents: nullableCents,
  dueDate: nullableDate,
  daysLeft: z.number().int(),
  secondNotice: z.boolean(),
});

export const letterSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  senderOrg: nullableString,
  receivedAt: isoDateTime,
  status: z.enum(LETTER_STATUSES),
  lane: z.enum(LANES).nullable(),
  kind: z.enum(KINDS).nullable(),
  summaryParent: nullableString,
  todoParent: nullableString,
  amountCents: nullableCents,
  dueDate: nullableDate,
  caseId: nullableString,
  trial: z.boolean(),
  imageUrl: z.string(),
});

export const todaySchema = z.object({
  household: householdSchema,
  asks: z.array(askSchema),
  upcoming: z.array(dueLineSchema),
  handledThisWeek: z.object({
    count: z.number().int().nonnegative(),
    items: z.array(letterSummarySchema),
  }),
  recent: z.array(letterSummarySchema),
});

export const caseEventSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  letterId: nullableString,
  type: z.string(),
  actor: z.enum(['agent', 'member']),
  memberId: nullableString,
  detail: z.record(z.string(), z.unknown()),
  createdAt: isoDateTime,
});

export const relationSchema = z.object({
  id: z.string(),
  letterId: z.string(),
  otherLetterId: z.string(),
  relation: z.enum(RELATIONS),
  probability: z.number().min(0).max(1),
  recallScore: z.number().nullable(),
  status: z.enum(['accepted', 'asked', 'rejected']),
  createdAt: isoDateTime,
});

export const caseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  title: z.string(),
  counterparty: z.string(),
  kind: z.enum(KINDS),
  status: z.enum(CASE_STATUSES),
  amountCents: nullableCents,
  dueDate: nullableDate,
  accountTail: nullableString,
  secondNotice: z.boolean(),
  contradiction: z.boolean(),
  boxFolderUrl: nullableString,
  letters: z.array(letterSummarySchema),
  events: z.array(caseEventSchema),
  relations: z.array(relationSchema),
});

export const checkSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  qtype: z.enum(QUESTION_TYPES),
  answer: z.string(),
  probability: z.number().min(0).max(1).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  threshold: z.number().nullable(),
  outcome: z.string(),
});

export const recallCandidateSchema = z.object({
  letterId: z.string(),
  title: z.string(),
  senderOrg: nullableString,
  receivedAt: isoDateTime,
  kind: z.enum(KINDS).nullable(),
  lane: z.enum(LANES).nullable(),
  recallScore: z.number().nullable(),
  tailMatch: z.boolean(),
  sameMatterProbability: z.number().min(0).max(1).nullable(),
});

export const outboxSchema = z.object({
  id: z.string(),
  kind: z.enum(OUTBOX_KINDS),
  toEmail: z.string().email(),
  subject: z.string(),
  bodyText: z.string(),
  status: z.enum(OUTBOX_STATUSES),
  suppressedReason: nullableString,
  agentmailMessageId: nullableString,
  agentmailThreadId: nullableString,
  createdAt: isoDateTime,
  sentAt: z.string().datetime({ offset: true }).nullable(),
});

export const decisionSchema = z.object({
  modelId: z.string(),
  latencyMs: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  questionCount: z.number().int().nonnegative(),
  jevTokens: z.number().int().nonnegative(),
  ollamaInTokens: z.number().int().nonnegative(),
  ollamaOutTokens: z.number().int().nonnegative(),
  costMicrousd: z.number().int().nonnegative(),
  rawResponseUrl: z.string(),
});

export const letterSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  source: z.enum(LETTER_SOURCES),
  trial: z.boolean(),
  submittedBy: nullableString,
  receivedAt: isoDateTime,
  status: z.enum(LETTER_STATUSES),
  mime: z.string(),
  title: z.string(),
  senderOrg: nullableString,
  summaryParent: nullableString,
  todoParent: nullableString,
  kind: z.enum(KINDS).nullable(),
  lane: z.enum(LANES).nullable(),
  amountCents: nullableCents,
  dueDate: nullableDate,
  accountTail: nullableString,
  phones: z.array(z.string()),
  scamRuleHits: z.array(z.string()),
  transcript: z.string(),
  caseId: nullableString,
  error: nullableString,
  imageUrl: z.string(),
  checks: z.array(checkSchema),
  notes: z.array(z.string()).default([]),
  relations: z.array(relationSchema),
  recall: z.array(recallCandidateSchema),
  outbox: z.array(outboxSchema),
  decision: decisionSchema.nullable(),
});

export const proofThresholdSchema = z.object({
  key: z.string(),
  bar: z.union([z.number(), z.string()]),
  effect: z.string(),
});

export const proofSchema = z.object({
  capturedAt: isoDateTime,
  where: z.object({
    spriteName: z.string(),
    url: z.string(),
    serviceStatus: z.string(),
    gitSha: z.string(),
    uptime: z.string(),
  }),
  connectors: z.array(
    z.object({
      provider: z.string(),
      connectionIdPrefix: z.string(),
      credentialLocation: z.string(),
    }),
  ),
  keyscan: z.object({
    found: z.number().int().nonnegative(),
    checkedAt: isoDateTime,
    envVarNames: z.array(z.string()),
  }),
  thresholds: z.array(proofThresholdSchema),
  eval: z
    .object({
      runId: z.string(),
      generatedAt: isoDateTime,
      heldout: z.boolean().default(false),
      letters: z.number().int().nonnegative(),
      laneAccuracy: z.number().min(0).max(1),
      neverSafe: z.string(),
      falseAlarms: z.number().int().nonnegative().default(0),
      scamsCaught: z.string(),
      linkPrecision: z.number().min(0).max(1),
      linkRecall: z.number().min(0).max(1),
      amountAccuracy: z.number().min(0).max(1).nullable().default(null),
      dueAccuracy: z.number().min(0).max(1).nullable().default(null),
      askRate: z.number().min(0).max(1),
      averageLatencyMs: z.number().int().nonnegative().nullable().default(null),
    })
    .nullable(),
  costs: z.object({
    lettersProcessed: z.number().int().nonnegative(),
    totalMicrousd: z.number().int().nonnegative(),
    averageMicrousd: z.number().int().nonnegative(),
    jevMicrousd: z.number().int().nonnegative(),
    ollamaMicrousd: z.number().int().nonnegative(),
  }),
  priorArt: z.object({
    name: z.string(),
    url: z.string(),
    difference: z.string(),
  }),
});

export const askAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(80),
});

export type HouseholdDTO = z.infer<typeof householdSchema>;
export type AskDTO = z.infer<typeof askSchema>;
export type AskOptionDTO = z.infer<typeof askOptionSchema>;
export type DueLineDTO = z.infer<typeof dueLineSchema>;
export type LetterSummaryDTO = z.infer<typeof letterSummarySchema>;
export type TodayDTO = z.infer<typeof todaySchema>;
export type CaseEventDTO = z.infer<typeof caseEventSchema>;
export type RelationDTO = z.infer<typeof relationSchema>;
export type CaseDTO = z.infer<typeof caseSchema>;
export type CheckDTO = z.infer<typeof checkSchema>;
export type RecallCandidateDTO = z.infer<typeof recallCandidateSchema>;
export type OutboxDTO = z.infer<typeof outboxSchema>;
export type DecisionDTO = z.infer<typeof decisionSchema>;
export type LetterDTO = z.infer<typeof letterSchema>;
export type ProofDTO = z.infer<typeof proofSchema>;
export type AskAnswer = z.infer<typeof askAnswerSchema>;
