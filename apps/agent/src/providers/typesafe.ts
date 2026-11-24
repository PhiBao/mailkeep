import { z } from 'zod';
import type { GatewayClient } from '../gateway/client.js';

const answerSchema = z.union([
  z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.string(), z.number().min(0).max(1)),
  }),
]);

const systemOneSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }),
});

const modelsSchema = z.object({
  models: z.array(
    z.object({ name: z.string(), description: z.string(), release_date: z.string() }),
  ),
});

export type SystemOneResponse = z.infer<typeof systemOneSchema>;

export async function listModels(client: GatewayClient) {
  const response = await client.request('typesafe', 'GET', '/v1/models');
  return modelsSchema.parse(response.json);
}

export async function systemOne(
  client: GatewayClient,
  input: { model: string; state: unknown; questions: Record<string, unknown> },
): Promise<SystemOneResponse> {
  const response = await client.request('typesafe', 'POST', '/v1/systemone', {
    json: input,
    timeoutMs: 120_000,
  });
  return systemOneSchema.parse(response.json);
}
