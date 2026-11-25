import { describe, expect, it } from 'vitest';
import { type RouteAnswer, type RouteInput, type RoutePast, route } from '../src/pipeline/route.js';

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
}

function past(status: RoutePast['caseStatus'] = 'open'): RoutePast {
  return {
    letterId: 'ltr_past',
    caseId: 'case_past',
    caseStatus: status,
    kind: 'bill',
    lane: 'headsup',
    receivedAt: '2026-11-18T00:00:00Z',
    senderOrg: 'Riverbend Water Utility',
    accountTail: '4471',
  };
}

function base(random: () => number): RouteInput {
  const probability = () => Number(random().toFixed(3));
  const answers: Record<string, RouteAnswer> = {
    kind: {
      type: 'choice',
      choice: 'bill',
      confidence: 0.95,
      probabilities: { bill: 0.95, statement: 0.03, other: 0.02 },
    },
    needs_action: { type: 'noul', noul: probability() },
    scam_payment: { type: 'noul', noul: probability() },
    scam_pressure: { type: 'noul', noul: probability() },
    scam_secrecy: { type: 'noul', noul: probability() },
    scam_prize_fee: { type: 'noul', noul: probability() },
    amount_due: {
      type: 'choice',
      choice: 'a0',
      confidence: probability(),
      probabilities: { a0: probability(), none: probability() },
    },
    due_date: {
      type: 'choice',
      choice: 'd0',
      confidence: probability(),
      probabilities: { d0: probability(), none: probability() },
    },
    same_matter_0: { type: 'noul', noul: probability() },
    follow_up_0: { type: 'noul', noul: probability() },
    completes_0: { type: 'noul', noul: probability() },
    sender_consistent_0: { type: 'noul', noul: probability() },
  };
  return {
    letterId: 'ltr_new',
    today: '2026-12-09',
    senderOrg: 'Riverbend Water Utility',
    title: 'Water bill',
    qualityFlagged: false,
    r2Failed: false,
    scamRuleHits: [],
    answers,
    past: [past()],
    amountCandidates: [{ id: 'a0', amountCents: 8417 }],
    dateCandidates: [{ id: 'd0', iso: '2026-12-10' }],
  };
}

describe('never-unsafe properties', () => {
  it('never routes a scam signal to handled/headsup or preserves an amount owed', () => {
    const random = rng(0x5ca1);
    const scamKeys = ['scam_payment', 'scam_pressure', 'scam_secrecy', 'scam_prize_fee'];
    for (let index = 0; index < 600; index += 1) {
      const input = base(random);
      const key = scamKeys[index % scamKeys.length] as string;
      input.answers[key] = { type: 'noul', noul: 0.5 + random() * 0.5 };
      if (index % 3 === 0) input.past = [past(index % 2 === 0 ? 'paid' : 'closed')];
      const output = route(input);
      expect(['handled', 'headsup']).not.toContain(output.lane);
      expect(output.amountCents).toBeNull();
    }
  });

  it('never files a coherent payable letter with an amount as handled', () => {
    const random = rng(0xb111);
    for (let index = 0; index < 600; index += 1) {
      const input = base(random);
      input.answers.needs_action = { type: 'noul', noul: 0.6 + random() * 0.4 };
      input.answers.amount_due = {
        type: 'choice',
        choice: 'a0',
        confidence: 0.7 + random() * 0.3,
        probabilities: { a0: 0.8, none: 0.2 },
      };
      input.answers.completes_0 = { type: 'noul', noul: random() * 0.59 };
      input.answers.same_matter_0 = { type: 'noul', noul: 0.1 };
      input.answers.sender_consistent_0 = { type: 'noul', noul: 0.99 };
      input.answers.scam_payment = { type: 'noul', noul: random() * 0.49 };
      input.answers.scam_pressure = { type: 'noul', noul: random() * 0.49 };
      input.answers.scam_secrecy = { type: 'noul', noul: random() * 0.49 };
      input.answers.scam_prize_fee = { type: 'noul', noul: random() * 0.49 };
      const output = route(input);
      expect(output.lane).not.toBe('handled');
      expect(output.amountCents).toBe(8417);
    }
  });

  it('always alerts and reopens a paid or closed case on a contradictory follow-up', () => {
    const random = rng(0xc0de);
    for (let index = 0; index < 600; index += 1) {
      const input = base(random);
      input.past = [past(index % 2 === 0 ? 'paid' : 'closed')];
      input.answers.same_matter_0 = { type: 'noul', noul: 0.85 + random() * 0.15 };
      input.answers.follow_up_0 = { type: 'noul', noul: 0.8 + random() * 0.2 };
      const output = route(input);
      expect(output.lane).toBe('needs_you');
      expect(output.familyAlert).toBe(true);
      expect(output.caseChange).toMatchObject({
        action: 'reopen',
        status: 'open',
        contradiction: true,
        secondNotice: true,
      });
      expect(output.relations).toContainEqual(
        expect.objectContaining({ relation: 'contradicts', status: 'accepted' }),
      );
    }
  });
});
