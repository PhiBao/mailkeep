import { describe, expect, it, vi } from 'vitest';
import type { GatewayClient } from '../src/gateway/client.js';
import { chat } from '../src/providers/ollama.js';

function clientWith(json: unknown) {
  const request = vi.fn().mockResolvedValue({ json });
  return { client: { request } as unknown as GatewayClient, request };
}

const response = {
  model: 'gemma4:31b',
  message: { role: 'assistant', content: 'Transcript' },
  prompt_eval_count: 12,
  eval_count: 4,
};

describe('Ollama chat requests', () => {
  it('disables thinking and bounds transcription output', async () => {
    const { client, request } = clientWith(response);
    await chat(client, {
      model: 'gemma4:31b',
      messages: [{ role: 'user', content: 'Transcribe', images: ['aW1hZ2U='] }],
      think: false,
      numPredict: 2048,
    });
    expect(request).toHaveBeenCalledWith('ollama', 'POST', '/api/chat', {
      json: {
        model: 'gemma4:31b',
        messages: [{ role: 'user', content: 'Transcribe', images: ['aW1hZ2U='] }],
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 2048 },
      },
      timeoutMs: 120_000,
    });
  });
});
