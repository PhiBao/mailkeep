import type { GatewayClient } from '../gateway/client.js';
import { deleteVectors, upsertVector } from '../providers/pinecone.js';

export interface MemoryLetter {
  id: string;
  vector: number[];
  caseId: string | null;
  senderOrg: string | null;
  accountTail: string | null;
  receivedAt: string;
  kind: string | null;
  lane: 'handled' | 'headsup' | 'needs_you' | 'careful' | null;
  trial: boolean;
}

export async function remember(
  client: GatewayClient,
  input: { index: string; namespace: string; letter: MemoryLetter },
): Promise<void> {
  await upsertVector(client, {
    index: input.index,
    namespace: input.namespace,
    id: input.letter.id,
    values: input.letter.vector,
    metadata: {
      case_id: input.letter.caseId,
      sender_org: input.letter.senderOrg,
      account_tail: input.letter.accountTail,
      received_at: input.letter.receivedAt,
      kind: input.letter.kind,
      lane: input.letter.lane,
      trial: input.letter.trial,
    },
  });
}

export async function forget(
  client: GatewayClient,
  input: { index: string; namespace: string; ids: string[] },
): Promise<void> {
  if (input.ids.length === 0) return;
  await deleteVectors(client, input);
}
