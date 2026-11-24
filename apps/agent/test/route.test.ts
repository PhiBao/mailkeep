import { describe, expect, it } from 'vitest';
import { type RouteAnswer, type RouteInput, type RoutePast, route } from '../src/pipeline/route.js';

function answers(overrides: Record<string, RouteAnswer> = {}): Record<string, RouteAnswer> {
  return {
    kind: {
      type: 'choice',
      choice: 'bill',
      confidence: 0.95,
      probabilities: { bill: 0.95, other: 0.05 },
    },
    needs_action: { type: 'noul', noul: 0.9 },
    scam_payment: { type: 'noul', noul: 0.01 },
    scam_pressure: { type: 'noul', noul: 0.01 },
    scam_impersonation: { type: 'noul', noul: 0.01 },
    scam_secrecy: { type: 'noul', noul: 0.01 },
    scam_prize_fee: { type: 'noul', noul: 0.01 },
    amount_due: {
      type: 'choice',
      choice: 'a0',
      confidence: 0.95,
      probabilities: { a0: 0.95, none: 0.05 },
    },
    due_date: {
      type: 'choice',
      choice: 'd0',
      confidence: 0.95,
      probabilities: { d0: 0.95, none: 0.05 },
    },
    ...overrides,
  };
}

function past(overrides: Partial<RoutePast> = {}): RoutePast {
  return {
    letterId: 'ltr_past',
    caseId: 'case_past',
    caseStatus: 'open',
    kind: 'bill',
    lane: 'headsup',
    receivedAt: '2026-11-18T00:00:00Z',
    senderOrg: 'Riverbend Water Utility',
    accountTail: '4471',
    ...overrides,
  };
}

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    letterId: 'ltr_new',
    today: '2026-12-09',
    senderOrg: 'Riverbend Water Utility',
    title: 'Water bill',
    qualityFlagged: false,
    r2Failed: false,
    scamRuleHits: [],
    answers: answers(),
    past: [],
    amountCandidates: [{ id: 'a0', amountCents: 8417 }],
    dateCandidates: [{ id: 'd0', iso: '2026-12-10' }],
    ...overrides,
  };
}

describe('A10 routing', () => {
  it.each([
    [
      'marketing is handled',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'marketing',
            confidence: 0.99,
            probabilities: { marketing: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.1 },
          amount_due: { type: 'choice', choice: 'none', confidence: 1, probabilities: { none: 1 } },
        }),
      },
      'handled',
    ],
    [
      'statement is handled',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'statement',
            confidence: 0.99,
            probabilities: { statement: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.2 },
        }),
      },
      'handled',
    ],
    [
      'personal letter is handled',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'personal',
            confidence: 0.99,
            probabilities: { personal: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.1 },
        }),
      },
      'handled',
    ],
    ['bill due tomorrow needs you', {}, 'needs_you'],
    [
      'bill due in eight days is headsup',
      { dateCandidates: [{ id: 'd0', iso: '2026-12-17' }] },
      'headsup',
    ],
    [
      'government letter needs you',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'government',
            confidence: 0.99,
            probabilities: { government: 0.99 },
          },
        }),
        dateCandidates: [{ id: 'd0', iso: '2027-01-20' }],
      },
      'needs_you',
    ],
    [
      'collection letter needs you',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'collection',
            confidence: 0.99,
            probabilities: { collection: 0.99 },
          },
        }),
        dateCandidates: [{ id: 'd0', iso: '2027-01-20' }],
      },
      'needs_you',
    ],
    [
      'large amount needs you',
      {
        amountCandidates: [{ id: 'a0', amountCents: 50000 }],
        dateCandidates: [{ id: 'd0', iso: '2027-01-20' }],
      },
      'needs_you',
    ],
    [
      'renewal without a due date needs you',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'renewal',
            confidence: 0.99,
            probabilities: { renewal: 0.99 },
          },
          due_date: { type: 'choice', choice: 'none', confidence: 1, probabilities: { none: 1 } },
        }),
      },
      'needs_you',
    ],
    [
      'unknown kind asks',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'other',
            confidence: 0.4,
            probabilities: { other: 0.4, bill: 0.35 },
          },
        }),
      },
      'needs_you',
    ],
    [
      'unmatched letter asks for a check',
      {
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'other',
            confidence: 0.99,
            probabilities: { other: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.1 },
        }),
      },
      'needs_you',
    ],
    [
      'quality override escalates handled mail',
      {
        qualityFlagged: true,
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'statement',
            confidence: 0.99,
            probabilities: { statement: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.1 },
        }),
      },
      'needs_you',
    ],
    [
      'R2 failure escalates handled mail',
      {
        r2Failed: true,
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'personal',
            confidence: 0.99,
            probabilities: { personal: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.1 },
        }),
      },
      'needs_you',
    ],
    [
      'model scam signal is careful and clears amount',
      { answers: answers({ scam_payment: { type: 'noul', noul: 0.5 } }) },
      'careful',
    ],
    ['code scam rule is careful and clears amount', { scamRuleHits: ['gift_card'] }, 'careful'],
  ] as Array<[string, Partial<RouteInput>, string]>)('%s', (_name, overrides, expected) => {
    const result = route(input(overrides));
    expect(result.lane).toBe(expected);
    if (expected === 'careful') expect(result.amountCents).toBeNull();
  });

  it('links an accepted same matter', () => {
    const result = route(
      input({ past: [past()], answers: answers({ same_matter_0: { type: 'noul', noul: 0.97 } }) }),
    );
    expect(result.relations).toContainEqual(
      expect.objectContaining({ relation: 'same_matter', status: 'accepted' }),
    );
  });

  it('asks for a link in the uncertainty band', () => {
    const result = route(
      input({ past: [past()], answers: answers({ same_matter_0: { type: 'noul', noul: 0.7 } }) }),
    );
    expect(result.asks).toContainEqual(expect.objectContaining({ qtype: 'link' }));
    expect(result.relations).toContainEqual(expect.objectContaining({ status: 'asked' }));
  });

  it('marks a second notice and alerts', () => {
    const result = route(
      input({
        past: [past()],
        answers: answers({
          same_matter_0: { type: 'noul', noul: 0.97 },
          follow_up_0: { type: 'noul', noul: 0.93 },
        }),
      }),
    );
    expect(result.lane).toBe('needs_you');
    expect(result.caseChange).toMatchObject({ secondNotice: true, status: 'open' });
    expect(result.familyAlert).toBe(true);
  });

  it('reopens a paid case on a contradictory past-due notice', () => {
    const result = route(
      input({
        past: [past({ caseStatus: 'paid' })],
        answers: answers({
          same_matter_0: { type: 'noul', noul: 0.97 },
          follow_up_0: { type: 'noul', noul: 0.93 },
        }),
      }),
    );
    expect(result.lane).toBe('needs_you');
    expect(result.caseChange).toMatchObject({
      action: 'reopen',
      status: 'open',
      contradiction: true,
    });
    expect(result.relations).toContainEqual(expect.objectContaining({ relation: 'contradicts' }));
    expect(result.familyAlert).toBe(true);
  });

  it('closes a case on an accepted completion', () => {
    const result = route(
      input({
        past: [past()],
        answers: answers({
          same_matter_0: { type: 'noul', noul: 0.97 },
          completes_0: { type: 'noul', noul: 0.96 },
        }),
      }),
    );
    expect(result.lane).toBe('handled');
    expect(result.caseChange).toMatchObject({ action: 'paid', status: 'paid', amountCents: null });
    expect(result.amountCents).toBeNull();
  });

  it('asks paid in the completion uncertainty band', () => {
    const result = route(
      input({
        past: [past()],
        answers: answers({
          same_matter_0: { type: 'noul', noul: 0.97 },
          completes_0: { type: 'noul', noul: 0.75 },
        }),
      }),
    );
    expect(result.asks).toContainEqual(expect.objectContaining({ qtype: 'paid' }));
  });

  it('treats a sender mismatch as careful', () => {
    const result = route(
      input({
        past: [past()],
        answers: answers({
          same_matter_0: { type: 'noul', noul: 0.9 },
          sender_consistent_0: { type: 'noul', noul: 0.1 },
        }),
      }),
    );
    expect(result.lane).toBe('careful');
    expect(result.amountCents).toBeNull();
    expect(result.relations).toContainEqual(
      expect.objectContaining({ relation: 'sender_mismatch' }),
    );
  });

  it('does not treat a rate-change letter as a follow-up', () => {
    const result = route(
      input({
        past: [past()],
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'statement',
            confidence: 0.99,
            probabilities: { statement: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.05 },
          same_matter_0: { type: 'noul', noul: 0.99 },
          follow_up_0: { type: 'noul', noul: 0.02 },
        }),
      }),
    );
    expect(result.lane).toBe('handled');
    expect(result.caseChange).toBeNull();
  });

  it('ignores amount and due fields below confidence', () => {
    const result = route(
      input({
        answers: answers({
          amount_due: { type: 'choice', choice: 'a0', confidence: 0.7, probabilities: { a0: 0.7 } },
          due_date: { type: 'choice', choice: 'd0', confidence: 0.7, probabilities: { d0: 0.7 } },
        }),
      }),
    );
    expect(result.amountCents).toBeNull();
    expect(result.dueDate).toBeNull();
    expect(result.lane).toBe('needs_you');
  });

  it('does not quiet-route marketing with an amount owed', () => {
    const result = route(
      input({
        answers: answers({
          kind: {
            type: 'choice',
            choice: 'marketing',
            confidence: 0.99,
            probabilities: { marketing: 0.99 },
          },
          needs_action: { type: 'noul', noul: 0.1 },
        }),
      }),
    );
    expect(result.lane).toBe('needs_you');
  });

  it('uses a forced kind without asking kind again', () => {
    const result = route(
      input({
        forced: { kind: 'personal' },
        answers: answers({
          kind: { type: 'choice', choice: 'other', confidence: 0.4, probabilities: { other: 0.4 } },
        }),
      }),
    );
    expect(result.kind).toBe('personal');
    expect(result.asks.some((ask) => ask.qtype === 'kind')).toBe(false);
  });
});
