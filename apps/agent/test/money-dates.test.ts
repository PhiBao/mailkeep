import { describe, expect, it } from 'vitest';
import { type RouteAnswer, type RouteInput, route } from '../src/pipeline/route.js';
import { todayIso } from '../src/util/clock.js';
import { formatUsd, parseUsd } from '../src/util/money.js';

function bill(today: string, dueDate: string): RouteInput {
  const answers: Record<string, RouteAnswer> = {
    kind: {
      type: 'choice',
      choice: 'bill',
      confidence: 0.99,
      probabilities: { bill: 0.99, other: 0.01 },
    },
    needs_action: { type: 'noul', noul: 0.99 },
    scam_payment: { type: 'noul', noul: 0.01 },
    scam_pressure: { type: 'noul', noul: 0.01 },
    scam_secrecy: { type: 'noul', noul: 0.01 },
    scam_prize_fee: { type: 'noul', noul: 0.01 },
    amount_due: {
      type: 'choice',
      choice: 'a0',
      confidence: 0.99,
      probabilities: { a0: 0.99, none: 0.01 },
    },
    due_date: {
      type: 'choice',
      choice: 'd0',
      confidence: 0.99,
      probabilities: { d0: 0.99, none: 0.01 },
    },
  };
  return {
    letterId: 'ltr_new',
    today,
    senderOrg: 'Riverbend Water Utility',
    title: 'Water bill',
    qualityFlagged: false,
    r2Failed: false,
    scamRuleHits: [],
    answers,
    past: [],
    amountCandidates: [{ id: 'a0', amountCents: 8417 }],
    dateCandidates: [{ id: 'd0', iso: dueDate }],
  };
}

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
}

describe('money and dates', () => {
  it.each([
    ['$1,284.00', 128400],
    ['$84.17', 8417],
    ['$0.99', 99],
    ['1284', 128400],
  ])('parses %s exactly', (text, cents) => {
    expect(parseUsd(text)).toBe(cents);
  });

  it.each([
    [8417, '$84.17'],
    [128400, '$1,284.00'],
    [99, '$0.99'],
  ])('formats %s cents without rounding drift', (cents, text) => {
    expect(formatUsd(cents)).toBe(text);
  });

  it('uses calendar days across the spring DST boundary', () => {
    expect(route(bill('2026-03-07', '2026-03-15')).lane).toBe('headsup');
    expect(route(bill('2026-03-07', '2026-03-14')).lane).toBe('needs_you');
    expect(route(bill('2026-03-08', '2026-03-08')).lane).toBe('needs_you');
  });

  it('uses calendar days across the fall DST boundary', () => {
    expect(route(bill('2026-10-31', '2026-11-08')).lane).toBe('headsup');
    expect(route(bill('2026-10-31', '2026-11-07')).lane).toBe('needs_you');
  });

  it('derives the household day in the household timezone', () => {
    const instant = new Date('2026-12-09T06:00:00.000Z');
    expect(todayIso({ clock_offset_days: 0, timezone: 'America/Chicago' }, instant)).toBe(
      '2026-12-09',
    );
    expect(todayIso({ clock_offset_days: 0, timezone: 'America/Los_Angeles' }, instant)).toBe(
      '2026-12-08',
    );
  });

  it('round-trips 600 generated USD amounts without drift', () => {
    const random = rng(0x0a11);
    for (let index = 0; index < 600; index += 1) {
      const cents = Math.floor(random() * 1_000_000);
      expect(parseUsd(formatUsd(cents))).toBe(cents);
    }
  });

  it('routes 600 generated calendar-date gaps at the due-soon boundary', () => {
    const random = rng(0xda7e);
    const origin = Date.UTC(2026, 0, 1);
    for (let index = 0; index < 600; index += 1) {
      const start = origin + Math.floor(random() * 730) * 86_400_000;
      const gap = Math.floor(random() * 24) - 3;
      const today = new Date(start).toISOString().slice(0, 10);
      const dueDate = new Date(start + gap * 86_400_000).toISOString().slice(0, 10);
      expect(route(bill(today, dueDate)).lane).toBe(gap <= 7 ? 'needs_you' : 'headsup');
    }
  });

  it('keeps the local day stable on both sides of DST changes', () => {
    expect(
      todayIso(
        { clock_offset_days: 0, timezone: 'America/Chicago' },
        new Date('2026-03-08T07:30:00.000Z'),
      ),
    ).toBe('2026-03-08');
    expect(
      todayIso(
        { clock_offset_days: 0, timezone: 'America/Chicago' },
        new Date('2026-03-08T08:30:00.000Z'),
      ),
    ).toBe('2026-03-08');
    expect(
      todayIso(
        { clock_offset_days: 0, timezone: 'America/Chicago' },
        new Date('2026-11-01T05:30:00.000Z'),
      ),
    ).toBe('2026-11-01');
    expect(
      todayIso(
        { clock_offset_days: 0, timezone: 'America/Chicago' },
        new Date('2026-11-01T06:30:00.000Z'),
      ),
    ).toBe('2026-11-01');
  });
});
