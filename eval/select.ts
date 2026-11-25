import type { LetterTruth } from './report.js';

export interface EvalTruthLetter {
  id: string;
  received: string;
  photo: string;
  heldout: boolean;
  truth: LetterTruth;
}

export interface EvalSelection {
  letters: EvalTruthLetter[];
  evaluatedIds: Set<string>;
  historyIds: Set<string>;
}

/** Held-out letters run once, after only the non-held-out ancestors their truth links require. */
export function selectEvalLetters(all: EvalTruthLetter[], heldout: boolean): EvalSelection {
  const evaluated = all.filter((letter) => letter.heldout === heldout);
  const evaluatedIds = new Set(evaluated.map((letter) => letter.id));
  const historyIds = new Set<string>();
  if (heldout) {
    const byId = new Map(all.map((letter) => [letter.id, letter]));
    const visit = (letter: EvalTruthLetter): void => {
      for (const link of letter.truth.links) {
        if (evaluatedIds.has(link.to) || historyIds.has(link.to)) continue;
        const ancestor = byId.get(link.to);
        if (!ancestor || ancestor.heldout) continue;
        historyIds.add(ancestor.id);
        visit(ancestor);
      }
    };
    for (const letter of evaluated) visit(letter);
  }
  const letters = all
    .filter((letter) => evaluatedIds.has(letter.id) || historyIds.has(letter.id))
    .sort(
      (left, right) =>
        left.received.localeCompare(right.received) || left.id.localeCompare(right.id),
    );
  return { letters, evaluatedIds, historyIds };
}
