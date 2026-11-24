import { describe, expect, it } from 'vitest';
import { buildRequest, type DecisionPast, type QuestionInput } from '../src/pipeline/questions.js';

function past(index: number): DecisionPast {
  return {
    id: `ltr_${index}`,
    received: `2026-11-${10 + index}`,
    sender: 'Riverbend Water Utility',
    kind: 'bill',
    caseStatus: 'open',
    amount: '$84.17',
    due: '2026-12-10',
    lane: 'headsup',
    text: 'November water bill for $84.17 due December 10.',
    phones: ['(555) 010-4471'],
  };
}

function input(): QuestionInput {
  return {
    today: '2026-12-09',
    new: {
      sender: 'Riverbend Water Utility',
      claimsGovernment: false,
      text: 'PAST DUE second notice for $89.17 due December 16.',
      phones: ['(555) 010-4471'],
    },
    past: Array.from({ length: 6 }, (_, index) => past(index)),
    amountCandidates: [{ id: 'a0', text: '$89.17', context: 'New balance due $89.17' }],
    dateCandidates: [{ id: 'd0', iso: '2026-12-16', text: 'Dec 16, 2026', context: 'Due Dec 16' }],
  };
}

describe('Jev request builder', () => {
  it('asks 33 questions for six past letters', () => {
    const request = buildRequest(input(), 'jev-1.14.0');
    expect(Object.keys(request.questions)).toHaveLength(33);
    expect(request.model).toBe('jev-1.14.0');
  });

  it('omits field questions without candidates and sender consistency for careful letters', () => {
    const value = input();
    value.amountCandidates = [];
    value.dateCandidates = [];
    value.past[0] = { ...past(0), lane: 'careful' };
    const request = buildRequest(value, 'jev-1.14.0');
    expect(request.questions.amount_due).toBeUndefined();
    expect(request.questions.due_date).toBeUndefined();
    expect(request.questions.sender_consistent_0).toBeUndefined();
    expect(request.questions.sender_consistent_1).toBeDefined();
  });

  it('matches the A9 request snapshot', () => {
    expect(buildRequest(input(), 'jev-1.14.0')).toMatchSnapshot();
  });
});
