import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type EvalTruthLetter, selectEvalLetters } from './select.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const truth = JSON.parse(await readFile(path.join(ROOT, 'testset/truth.json'), 'utf8')) as Record<
  string,
  EvalTruthLetter
>;

describe('evaluation split selection', () => {
  it('selects all 30 non-held-out letters without history', () => {
    const selection = selectEvalLetters(Object.values(truth), false);
    expect(selection.letters).toHaveLength(30);
    expect(selection.evaluatedIds.size).toBe(30);
    expect(selection.historyIds.size).toBe(0);
  });

  it('selects six held-out letters plus only L13 and L30 history', () => {
    const selection = selectEvalLetters(Object.values(truth), true);
    expect([...selection.evaluatedIds].sort()).toEqual(['L14', 'L27', 'L31', 'L33', 'L35', 'L36']);
    expect([...selection.historyIds].sort()).toEqual(['L13', 'L30']);
    expect(selection.letters.map((letter) => letter.id)).toEqual([
      'L13',
      'L30',
      'L27',
      'L33',
      'L36',
      'L35',
      'L31',
      'L14',
    ]);
    for (const historyId of selection.historyIds) {
      expect(truth[historyId]?.heldout).toBe(false);
      const historyIndex = selection.letters.findIndex((letter) => letter.id === historyId);
      const dependent = selection.letters.find((letter) =>
        letter.truth.links.some((link) => link.to === historyId),
      );
      expect(dependent).toBeDefined();
      expect(historyIndex).toBeLessThan(selection.letters.indexOf(dependent as EvalTruthLetter));
    }
  });
});
