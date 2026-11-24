import { z } from 'zod';
import { type GatewayClient, ProviderError } from '../gateway/client.js';

const nativeSchema = z.object({
  model: z.string(),
  message: z.object({ role: z.string(), content: z.string() }),
  prompt_eval_count: z.number().int(),
  eval_count: z.number().int(),
});

const openAiSchema = z.object({
  model: z.string(),
  choices: z
    .array(z.object({ message: z.object({ role: z.string(), content: z.string() }) }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number().int(), completion_tokens: z.number().int() }),
});

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });

export interface OllamaChatResult {
  content: string;
  promptTokens: number;
  outputTokens: number;
  model: string;
}

export async function listModels(client: GatewayClient) {
  const response = await client.request('ollama', 'GET', '/api/tags');
  return tagsSchema.parse(response.json);
}

export async function chat(
  client: GatewayClient,
  input: {
    model: string;
    messages: Array<{ role: string; content: string; images?: string[] }>;
    think?: boolean;
    numPredict?: number;
  },
): Promise<OllamaChatResult> {
  const { think = false, numPredict, ...request } = input;
  try {
    const response = await client.request('ollama', 'POST', '/api/chat', {
      json: {
        ...request,
        stream: false,
        think,
        options: { temperature: 0, ...(numPredict ? { num_predict: numPredict } : {}) },
      },
      timeoutMs: 120_000,
    });
    const parsed = nativeSchema.parse(response.json);
    return {
      content: parsed.message.content,
      promptTokens: parsed.prompt_eval_count,
      outputTokens: parsed.eval_count,
      model: parsed.model,
    };
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    const response = await client.request('ollama', 'POST', '/v1/chat/completions', {
      json: {
        model: input.model,
        messages: input.messages.map((message) => {
          if (!message.images?.length) return message;
          return {
            role: message.role,
            content: [
              { type: 'text', text: message.content },
              ...message.images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${image}` },
              })),
            ],
          };
        }),
        stream: false,
        temperature: 0,
        ...(numPredict ? { max_tokens: numPredict } : {}),
      },
      timeoutMs: 120_000,
    });
    const parsed = openAiSchema.parse(response.json);
    const message = parsed.choices[0]?.message;
    if (!message) throw new Error('Ollama returned no choices');
    return {
      content: message.content,
      promptTokens: parsed.usage.prompt_tokens,
      outputTokens: parsed.usage.completion_tokens,
      model: parsed.model,
    };
  }
}
