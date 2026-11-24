import { describe, expect, it } from 'vitest';
import { amountCandidates, dateCandidates, phoneCandidates } from '../src/pipeline/candidates.js';
import { parseDateCandidate } from '../src/util/dates.js';
import { formatUsd, parseUsd } from '../src/util/money.js';

describe('candidates', () => {
  it('parses amounts with context and caps the list', () => {
    const text = `Pay $1,284.00 by December 15. ${Array.from({ length: 10 }, () => '$2.50').join(' ')}`;
    const amounts = amountCandidates(text);
    expect(amounts).toHaveLength(8);
    expect(amounts[0]).toMatchObject({ text: '$1,284.00', amountCents: 128400 });
    expect(amounts[0]?.context).toContain('December 15');
    expect(parseUsd('$84.17')).toBe(8417);
    expect(formatUsd(128400)).toBe('$1,284.00');
  });

  it('parses every supported date format and rejects impossible dates', () => {
    expect(parseDateCandidate('December 10, 2026')).toBe('2026-12-10');
    expect(parseDateCandidate('Dec 16 2026')).toBe('2026-12-16');
    expect(parseDateCandidate('12/25/2026')).toBe('2026-12-25');
    expect(parseDateCandidate('1/2/27')).toBe('2027-01-02');
    expect(parseDateCandidate('2026-12-31')).toBe('2026-12-31');
    expect(parseDateCandidate('February 30, 2026')).toBeNull();
    const dates = dateCandidates('Due December 10, 2026 or 12/16/2026.');
    expect(dates.map((item) => item.iso)).toEqual(['2026-12-10', '2026-12-16']);
  });

  it('finds US phone numbers with context', () => {
    const phones = phoneCandidates('Call (555) 010-4471, 555-010-2200 or +1 555 010 3300 today.');
    expect(phones).toHaveLength(3);
    expect(phones[0]?.context).toContain('Call');
    expect(phones[2]?.text).toBe('+1 555 010 3300');
  });
});
