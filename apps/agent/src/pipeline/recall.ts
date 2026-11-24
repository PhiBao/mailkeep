import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import { embed, queryVectors } from '../providers/pinecone.js';

export interface RecallLetter {
  id: string;
  household_id: string;
  received_at: string;
  trial: number;
  sender_org: string | null;
  title: string | null;
  transcript: string | null;
  account_tail: string | null;
  kind: string | null;
  lane: 'handled' | 'headsup' | 'needs_you' | 'careful' | null;
}

export interface RecallCandidate {
  letter: RecallLetter;
  recallScore: number | null;
  tailMatch: boolean;
}

interface CandidateSeed {
  letter: RecallLetter;
  recallScore: number | null;
  tailMatch: boolean;
}

export function embedText(letter: RecallLetter): string {
  return `${letter.sender_org ?? ''} | ${letter.title ?? ''} | acct ${letter.account_tail ?? ''} | ${(letter.transcript ?? '').slice(0, 600)}`;
}

export function mergeCandidates(
  exact: CandidateSeed[],
  semantic: CandidateSeed[],
  limit = 6,
): RecallCandidate[] {
  const merged = new Map<string, CandidateSeed>();
  for (const candidate of [...exact, ...semantic]) {
    const existing = merged.get(candidate.letter.id);
    if (!existing) {
      merged.set(candidate.letter.id, candidate);
      continue;
    }
    merged.set(candidate.letter.id, {
      letter: existing.letter,
      recallScore:
        existing.recallScore === null
          ? candidate.recallScore
          : candidate.recallScore === null
            ? existing.recallScore
            : Math.max(existing.recallScore, candidate.recallScore),
      tailMatch: existing.tailMatch || candidate.tailMatch,
    });
  }

  return [...merged.values()]
    .sort((left, right) => {
      if (left.tailMatch !== right.tailMatch) return left.tailMatch ? -1 : 1;
      const leftScore = left.recallScore ?? -1;
      const rightScore = right.recallScore ?? -1;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return right.letter.received_at.localeCompare(left.letter.received_at);
    })
    .slice(0, limit);
}

function rowsByIds(db: DB, householdId: string, ids: string[]): Map<string, RecallLetter> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM letters WHERE household_id = ? AND id IN (${placeholders})`)
    .all(householdId, ...ids) as RecallLetter[];
  return new Map(rows.map((row) => [row.id, row]));
}

export async function recall(
  client: GatewayClient,
  db: DB,
  input: { householdId: string; namespace: string; index: string; letter: RecallLetter },
): Promise<RecallCandidate[]> {
  const exactRows = input.letter.account_tail
    ? (db
        .prepare(
          `SELECT * FROM letters
           WHERE household_id = ? AND account_tail = ? AND id != ?
             ${input.letter.trial ? '' : 'AND trial = 0'}
           ORDER BY received_at DESC LIMIT 3`,
        )
        .all(input.householdId, input.letter.account_tail, input.letter.id) as RecallLetter[])
    : [];
  const exact = exactRows.map((letter) => ({ letter, recallScore: null, tailMatch: true }));
  const vector = await embed(client, { text: embedText(input.letter), inputType: 'query' });
  const result = await queryVectors(client, {
    index: input.index,
    namespace: input.namespace,
    vector,
    topK: 8,
  });
  const matches = result.matches.filter((match) => {
    if (match.id === input.letter.id || match.score < 0.35) return false;
    const trial = match.metadata?.trial;
    return input.letter.trial === 1 || (trial !== true && trial !== 1);
  });
  const rows = rowsByIds(
    db,
    input.householdId,
    matches.map((match) => match.id),
  );
  const semantic = matches.flatMap((match) => {
    const letter = rows.get(match.id);
    return letter ? [{ letter, recallScore: match.score, tailMatch: false }] : [];
  });
  return mergeCandidates(exact, semantic);
}
