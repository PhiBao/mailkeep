import { describe, expect, it } from 'vitest';
import { CASE_EVENTS, transitionCase } from '../src/cases/machine.js';

describe('case state machine', () => {
  it.each([
    ['open', 'paid_signal', 'paid'],
    ['open', 'marked_paid', 'paid'],
    ['open', 'closed', 'closed'],
    ['open', 'overdue', 'overdue'],
    ['open', 'escalated', 'watch'],
    ['paid', 'contradiction', 'open'],
    ['paid', 'reopened', 'open'],
    ['closed', 'reopened', 'open'],
    ['watch', 'closed', 'closed'],
  ] as const)('%s → %s becomes %s', (current, event, expected) => {
    expect(transitionCase(current, event)).toBe(expected);
  });

  it('rejects unsafe transitions', () => {
    expect(() => transitionCase('paid', 'marked_paid')).toThrow(/not allowed/);
    expect(() => transitionCase('closed', 'paid_signal')).toThrow(/not allowed/);
  });

  it('exposes the complete event vocabulary', () => {
    expect(CASE_EVENTS).toEqual([
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
    ]);
  });
});
