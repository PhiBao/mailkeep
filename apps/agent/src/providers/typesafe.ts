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

const questionSchema = z.union([
  z.object({ type: z.literal('noul'), instructions: z.string() }),
  z.object({
    type: z.literal('choice'),
    instructions: z.string(),
    criteria: z.record(z.string(), z.string()),
  }),
]);

const modelsSchema = z.object({
  models: z.array(
    z.object({ name: z.string(), description: z.string(), release_date: z.string() }),
  ),
});

export type SystemOneResponse = z.infer<typeof systemOneSchema>;

function validateAnswers(
  response: SystemOneResponse,
  requestedQuestions: Record<string, unknown>,
): void {
  const questions = z.record(z.string(), questionSchema).parse(requestedQuestions);
  const requestedKeys = Object.keys(questions).sort();
  const answeredKeys = Object.keys(response.answers).sort();
  if (requestedKeys.join('\n') !== answeredKeys.join('\n')) {
    throw new Error('TypeSafe response did not answer exactly the requested questions');
  }
  for (const [key, question] of Object.entries(questions)) {
    const answer = response.answers[key];
    if (!answer) throw new Error(`TypeSafe response was missing question ${key}`);
    if (answer.type !== question.type) {
      throw new Error(`TypeSafe answer type did not match question ${key}`);
    }
    if (question.type === 'choice' && answer.type === 'choice') {
      if (!(answer.choice in question.criteria)) {
        throw new Error(`TypeSafe answer choice did not match question ${key}`);
      }
      if (!(answer.choice in answer.probabilities)) {
        throw new Error(`TypeSafe answer probability was missing for question ${key}`);
      }
      if (Object.keys(answer.probabilities).some((choice) => !(choice in question.criteria))) {
        throw new Error(`TypeSafe answer probabilities did not match question ${key}`);
      }
    }
  }
}

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
  const parsed = systemOneSchema.parse(response.json);
  validateAnswers(parsed, input.questions);
  return parsed;
}
