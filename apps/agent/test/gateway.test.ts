import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  GatewayClient,
  GatewayDenied,
  GatewayTimeout,
  GatewayUnauthed,
} from '../src/gateway/client.js';

const silentLogger = { info: () => {}, warn: () => {} };
const listPayload = {
  connections: [
    { provider: 'typesafe', gateway_base_url: 'https://gateway/typesafe/conn_ts' },
    { provider: 'ollama', gateway_base_url: 'https://gateway/ollama/conn_ol' },
    {
      provider: 'custom_api',
      gateway_base_url: 'https://gateway/custom_api/conn_am',
      provider_info: { base_api_url: 'https://api.agentmail.to' },
    },
  ],
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

describe('gateway client', () => {
  it('discovers direct and Custom API bases', async () => {
    const client = new GatewayClient({
      config: loadConfig({}),
      fetchImpl: async () => response(200, listPayload),
      logger: silentLogger,
    });
    const bases = await client.discover();
    expect(bases.get('typesafe')).toBe('https://gateway/typesafe/conn_ts');
    expect(bases.get('agentmail')).toBe('https://gateway/custom_api/conn_am');
  });

  it('retries retryable statuses with backoff', async () => {
    const replies = [
      response(200, listPayload),
      response(503, 'busy'),
      response(200, { ok: true }),
    ];
    const sleeps: number[] = [];
    const client = new GatewayClient({
      config: loadConfig({}),
      fetchImpl: async () => replies.shift() as Response,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      random: () => 0,
      logger: silentLogger,
    });
    const result = await client.request('typesafe', 'GET', '/v1/models');
    expect(result.json).toEqual({ ok: true });
    expect(sleeps).toEqual([250]);
  });

  it('honours retry-after', async () => {
    const replies = [
      response(200, listPayload),
      response(429, 'slow down', { 'retry-after': '2' }),
      response(200, { ok: true }),
    ];
    const sleeps: number[] = [];
    const client = new GatewayClient({
      config: loadConfig({}),
      fetchImpl: async () => replies.shift() as Response,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      logger: silentLogger,
    });
    await client.request('typesafe', 'GET', '/v1/models');
    expect(sleeps).toEqual([2000]);
  });

  it('does not retry a non-retryable provider error', async () => {
    let calls = 0;
    const client = new GatewayClient({
      config: loadConfig({}),
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? response(200, listPayload) : response(400, 'bad request');
      },
      logger: silentLogger,
    });
    await expect(client.request('typesafe', 'POST', '/v1/systemone')).rejects.toMatchObject({
      name: 'ProviderError',
      status: 400,
    });
    expect(calls).toBe(2);
  });

  it('maps 401 and 403 to the gateway taxonomy', async () => {
    for (const [status, expected] of [
      [401, GatewayUnauthed],
      [403, GatewayDenied],
    ] as const) {
      let calls = 0;
      const client = new GatewayClient({
        config: loadConfig({}),
        fetchImpl: async () => {
          calls += 1;
          return calls === 1 ? response(200, listPayload) : response(status, 'denied');
        },
        logger: silentLogger,
      });
      await expect(client.request('typesafe', 'GET', '/v1/models')).rejects.toBeInstanceOf(
        expected,
      );
      expect(calls).toBe(2);
    }
  });

  it('maps repeated timeout errors to GatewayTimeout', async () => {
    let calls = 0;
    const client = new GatewayClient({
      config: loadConfig({}),
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return response(200, listPayload);
        throw new DOMException('timed out', 'TimeoutError');
      },
      sleep: async () => {},
      logger: silentLogger,
    });
    await expect(client.request('ollama', 'POST', '/api/chat')).rejects.toBeInstanceOf(
      GatewayTimeout,
    );
    expect(calls).toBe(5);
  });
});
