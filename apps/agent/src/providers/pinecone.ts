import { z } from 'zod';
import type { GatewayClient } from '../gateway/client.js';

const embedSchema = z.object({
  data: z.array(z.object({ values: z.array(z.number()).length(1024) })).min(1),
});
const upsertSchema = z.object({ upsertedCount: z.number().int().optional() });
const querySchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  namespace: z.string().optional(),
});
const deleteSchema = z.object({}).passthrough();
const indexesSchema = z.object({
  indexes: z.array(
    z.object({
      name: z.string(),
      dimension: z.number().int(),
      metric: z.string(),
      status: z.object({ ready: z.boolean() }),
    }),
  ),
});

export async function listIndexes(client: GatewayClient) {
  const response = await client.request('pinecone', 'GET', '/indexes');
  return indexesSchema.parse(response.json);
}

export async function embed(
  client: GatewayClient,
  input: { text: string; inputType: 'passage' | 'query' },
): Promise<number[]> {
  const response = await client.request('pinecone', 'POST', '/embed', {
    json: {
      model: 'llama-text-embed-v2',
      inputs: [{ text: input.text }],
      parameters: { input_type: input.inputType, truncate: 'END' },
    },
  });
  const parsed = embedSchema.parse(response.json);
  const values = parsed.data[0]?.values;
  if (!values) throw new Error('Pinecone returned no embedding');
  return values;
}

export async function upsertVector(
  client: GatewayClient,
  input: {
    index: string;
    namespace: string;
    id: string;
    values: number[];
    metadata: Record<string, unknown>;
  },
) {
  const response = await client.request(
    'pinecone',
    'POST',
    `/indexes/${input.index}/vectors/upsert`,
    {
      json: {
        namespace: input.namespace,
        vectors: [{ id: input.id, values: input.values, metadata: input.metadata }],
      },
    },
  );
  return upsertSchema.parse(response.json);
}

export async function queryVectors(
  client: GatewayClient,
  input: { index: string; namespace: string; vector: number[]; topK: number },
) {
  const response = await client.request('pinecone', 'POST', `/indexes/${input.index}/query`, {
    json: {
      namespace: input.namespace,
      vector: input.vector,
      topK: input.topK,
      includeMetadata: true,
    },
  });
  return querySchema.parse(response.json);
}

export async function deleteNamespace(
  client: GatewayClient,
  input: { index: string; namespace: string },
) {
  const response = await client.request(
    'pinecone',
    'POST',
    `/indexes/${input.index}/vectors/delete`,
    {
      json: { namespace: input.namespace, deleteAll: true },
    },
  );
  return deleteSchema.parse(response.json);
}
