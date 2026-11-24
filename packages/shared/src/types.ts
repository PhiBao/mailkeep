export const LANES = ['handled', 'headsup', 'needs_you', 'careful'] as const;
export type Lane = (typeof LANES)[number];

export const KINDS = [
  'bill',
  'statement',
  'renewal',
  'appointment',
  'government',
  'collection',
  'payment_confirmation',
  'marketing',
  'personal',
  'other',
] as const;
export type Kind = (typeof KINDS)[number];

export const RELATIONS = [
  'same_matter',
  'follow_up',
  'completes',
  'contradicts',
  'sender_mismatch',
] as const;
export type Relation = (typeof RELATIONS)[number];

export const CASE_STATUSES = ['open', 'overdue', 'paid', 'closed', 'watch'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const ASK_TYPES = ['link', 'paid', 'scam', 'kind', 'check', 'retake'] as const;
export type AskType = (typeof ASK_TYPES)[number];

export const LETTER_STATUSES = [
  'queued',
  'reading',
  'recalling',
  'deciding',
  'acting',
  'done',
  'needs_retake',
  'failed',
] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

export const LETTER_SOURCES = ['email', 'upload', 'sample', 'seed', 'eval'] as const;
export type LetterSource = (typeof LETTER_SOURCES)[number];

export const MEMBER_ROLES = ['parent', 'family'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const QUESTION_TYPES = ['noul', 'choice', 'code'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const OUTBOX_KINDS = [
  'parent_note',
  'family_alert',
  'ask',
  'digest',
  'login',
  'retake',
] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

export const OUTBOX_STATUSES = ['pending', 'sent', 'failed', 'suppressed'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];
