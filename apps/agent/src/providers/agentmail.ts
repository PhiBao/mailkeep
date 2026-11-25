import { z } from 'zod';
import type { GatewayClient } from '../gateway/client.js';

const inboxSchema = z.object({
  inbox_id: z.string(),
  email: z.string(),
  display_name: z.string().optional(),
});
const inboxesSchema = z.object({ inboxes: z.array(inboxSchema) });
const messageSchema = z.object({
  message_id: z.string(),
  thread_id: z.string(),
  subject: z.string().optional(),
  timestamp: z.string().optional(),
  from: z.unknown().optional(),
  to: z.unknown().optional(),
  text: z.string().optional(),
  attachments: z.unknown().optional(),
});
const messagesSchema = z.object({ messages: z.array(messageSchema) });
const attachmentSchema = z.object({
  attachment_id: z.string(),
  filename: z.string(),
  size: z.number().int(),
  content_type: z.string(),
  download_url: z.string().url(),
  expires_at: z.string().optional(),
});
const sendSchema = z.object({ message_id: z.string(), thread_id: z.string() });

export type Addresses = string | string[];

export async function listInboxes(client: GatewayClient) {
  const response = await client.request('agentmail', 'GET', '/v0/inboxes');
  return inboxesSchema.parse(response.json);
}

export async function listMessages(
  client: GatewayClient,
  input: { inboxId: string; after?: string; limit?: number },
) {
  const query = new URLSearchParams();
  if (input.after) query.set('after', input.after);
  if (input.limit) query.set('limit', String(input.limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await client.request(
    'agentmail',
    'GET',
    `/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages${suffix}`,
  );
  return messagesSchema.parse(response.json);
}

export async function getMessage(
  client: GatewayClient,
  input: { inboxId: string; messageId: string },
) {
  const response = await client.request(
    'agentmail',
    'GET',
    `/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}`,
  );
  return messageSchema.parse(response.json);
}

export async function getAttachment(
  client: GatewayClient,
  input: { inboxId: string; messageId: string; attachmentId: string },
) {
  const response = await client.request(
    'agentmail',
    'GET',
    `/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,
  );
  return attachmentSchema.parse(response.json);
}

export async function downloadAttachment(downloadUrl: string): Promise<Buffer> {
  const url = new URL(downloadUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.agentmail.to') {
    throw new Error('Attachment URL is not an approved AgentMail CDN URL');
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Attachment download returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function sendMessage(
  client: GatewayClient,
  input: {
    inboxId: string;
    to: Addresses;
    subject: string;
    text: string;
    attachments?: Array<{ filename: string; content_type: string; content: string }>;
  },
) {
  const response = await client.request(
    'agentmail',
    'POST',
    `/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages/send`,
    {
      json: {
        to: input.to,
        subject: input.subject,
        text: input.text,
        attachments: input.attachments,
      },
      retry: 0,
    },
  );
  return sendSchema.parse(response.json);
}

export async function replyToMessage(
  client: GatewayClient,
  input: { inboxId: string; messageId: string; text: string; subject?: string },
) {
  const response = await client.request(
    'agentmail',
    'POST',
    `/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}/reply`,
    { json: { text: input.text, subject: input.subject }, retry: 0 },
  );
  return sendSchema.parse(response.json);
}
