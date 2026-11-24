import { describe, expect, it } from 'vitest';
import { embedText, mergeCandidates, type RecallLetter } from '../src/pipeline/recall.js';

function letter(id: string, received: string, overrides: Partial<RecallLetter> = {}): RecallLetter {
  return {
    id,
    household_id: 'hh_test',
    received_at: received,
    trial: 0,
    sender_org: 'Riverbend Water Utility',
    title: 'Water bill',
    transcript: 'Water bill for $84.17 due December 10.',
    account_tail: '4471',
    kind: 'bill',
    lane: 'headsup',
    ...overrides,
  };
}

describe('recall union', () => {
  it('builds the embedding text from the specified fields', () => {
    expect(embedText(letter('ltr_1', '2026-11-18'))).toBe(
      'Riverbend Water Utility | Water bill | acct 4471 | Water bill for $84.17 due December 10.',
    );
  });

  it('dedupes exact-tail and semantic matches, preserving the strongest evidence', () => {
    const exact = letter('ltr_1', '2026-11-18');
    const semanticOnly = letter('ltr_2', '2026-11-20');
    const result = mergeCandidates(
      [{ letter: exact, recallScore: null, tailMatch: true }],
      [
        { letter: exact, recallScore: 0.91, tailMatch: false },
        { letter: semanticOnly, recallScore: 0.72, tailMatch: false },
      ],
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ letter: exact, recallScore: 0.91, tailMatch: true });
    expect(result[1]?.letter.id).toBe('ltr_2');
  });

  it('orders by evidence then recency and caps at six', () => {
    const exact = Array.from({ length: 3 }, (_, index) =>
      letter(`tail_${index}`, `2026-11-${20 - index}`),
    );
    const semantic = Array.from({ length: 6 }, (_, index) =>
      letter(`semantic_${index}`, `2026-11-${10 + index}`, { account_tail: null }),
    );
    const result = mergeCandidates(
      exact.map((item) => ({ letter: item, recallScore: null, tailMatch: true })),
      semantic.map((item, index) => ({
        letter: item,
        recallScore: 0.4 + index * 0.05,
        tailMatch: false,
      })),
    );
    expect(result).toHaveLength(6);
    expect(result.slice(0, 3).every((item) => item.tailMatch)).toBe(true);
    expect(result[0]?.letter.id).toBe('tail_0');
    expect(result[3]?.letter.id).toBe('semantic_5');
  });
});
