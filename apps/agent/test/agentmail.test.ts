import { describe, expect, it, vi } from 'vitest';
import type { GatewayClient } from '../src/gateway/client.js';
import { replyToMessage, sendMessage } from '../src/providers/agentmail.js';

function clientFor(payload: unknown): GatewayClient {
  return {
    request: vi.fn().mockResolvedValue({ json: payload }),
  } as unknown as GatewayClient;
}

describe('AgentMail non-idempotent sends', () => {
  it('does not automatically retry a new message send', async () => {
    const client = clientFor({ message_id: 'msg_1', thread_id: 'thread_1' });
    await sendMessage(client, {
      inboxId: 'kiter@agentmail.to',
      to: 'kiter7396@gmail.com',
      subject: 'Subject',
      text: 'Body',
    });
    expect(client.request).toHaveBeenCalledWith(
      'agentmail',
      'POST',
      '/v0/inboxes/kiter%40agentmail.to/messages/send',
      expect.objectContaining({ retry: 0 }),
    );
  });

  it('does not automatically retry a reply send', async () => {
    const client = clientFor({ message_id: 'msg_2', thread_id: 'thread_1' });
    await replyToMessage(client, {
      inboxId: 'kiter@agentmail.to',
      messageId: '<original@example.com>',
      text: 'Body',
    });
    expect(client.request).toHaveBeenCalledWith(
      'agentmail',
      'POST',
      '/v0/inboxes/kiter%40agentmail.to/messages/%3Coriginal%40example.com%3E/reply',
      expect.objectContaining({ retry: 0 }),
    );
  });
});
