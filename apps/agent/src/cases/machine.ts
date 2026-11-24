import type { CaseStatus } from '@mailkeep/shared';

export const CASE_EVENTS = [
  'opened',
  'linked',
  'reminder_received',
  'paid_signal',
  'marked_paid',
  'contradiction',
  'asked',
  'answered',
  'escalated',
  'overdue',
  'closed',
  'reopened',
] as const;
export type CaseEventType = (typeof CASE_EVENTS)[number];

const TRANSITIONS: Record<CaseStatus, Partial<Record<CaseEventType, CaseStatus>>> = {
  open: {
    opened: 'open',
    linked: 'open',
    reminder_received: 'open',
    paid_signal: 'paid',
    marked_paid: 'paid',
    asked: 'open',
    answered: 'open',
    escalated: 'watch',
    overdue: 'overdue',
    closed: 'closed',
  },
  overdue: {
    linked: 'overdue',
    reminder_received: 'overdue',
    paid_signal: 'paid',
    marked_paid: 'paid',
    asked: 'overdue',
    answered: 'overdue',
    escalated: 'watch',
    closed: 'closed',
    reopened: 'open',
  },
  paid: {
    contradiction: 'open',
    reopened: 'open',
  },
  closed: {
    reopened: 'open',
  },
  watch: {
    closed: 'closed',
    reopened: 'open',
    answered: 'watch',
  },
};

export function transitionCase(current: CaseStatus, event: CaseEventType): CaseStatus {
  const next = TRANSITIONS[current][event];
  if (!next) throw new Error(`Case transition ${current} → ${event} is not allowed`);
  return next;
}
