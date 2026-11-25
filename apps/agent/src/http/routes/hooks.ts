import { Hono } from 'hono';
import type { Config } from '../../config.js';
import type { DB } from '../../db/db.js';
import { getMemberByEmail } from '../../db/repo.js';
import type { GatewayClient } from '../../gateway/client.js';
import { handleAskReply } from '../../notify/replies.js';
import { intakeEmailAttachment, MAX_FILE_BYTES } from '../../pipeline/intake.js';
import type { PipelineQueue } from '../../pipeline/queue.js';
import {
  downloadAttachment,
  getAttachment,
  listInboxes,
  listMessages,
} from '../../providers/agentmail.js';
import { log } from '../../util/log.js';

export interface HookDeps {
  config: Config;
  db: DB;
  client: GatewayClient;
  queue: PipelineQueue;
  replyHandler?: typeof handleAskReply;
  poll?: typeof pollAgentMail;
}

export interface InboundMessage {
  message_id: string;
  thread_id: string;
  subject?: string | undefined;
  text?: string | undefined;
  timestamp?: string | undefined;
  from?: unknown;
  attachments?: unknown;
}

export interface AttachmentMetadata {
  attachment_id: string;
  download_url: string;
  size?: number;
}

export interface MailAdapter {
  listMessages: (inboxId: string, after: string) => Promise<InboundMessage[]>;
  getAttachment: (
    inboxId: string,
    messageId: string,
    attachmentId: string,
  ) => Promise<AttachmentMetadata>;
  downloadAttachment: (url: string) => Promise<Buffer>;
}

function senderEmail(value: unknown): string | null {
  if (typeof value === 'string') {
    const angle = value.match(/<([^>]+)>/);
    return (angle?.[1] ?? value).trim().toLowerCase();
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      if (typeof item === 'string' && item.includes('@')) return item.trim().toLowerCase();
    }
  }
  return null;
}

function attachmentList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value))
    return value.map((item) => (item && typeof item === 'object' ? item : {}));
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export async function pollAgentMail(deps: HookDeps, adapter?: MailAdapter): Promise<void> {
  const mail: MailAdapter = adapter ?? {
    listMessages: async (inboxId, after) => {
      const result = await listMessages(deps.client, { inboxId, after, limit: 100 });
      return result.messages;
    },
    getAttachment: async (inboxId, messageId, attachmentId) =>
      getAttachment(deps.client, { inboxId, messageId, attachmentId }),
    downloadAttachment,
  };
  const inboxId =
    deps.config.MAILKEEP_AGENTMAIL_INBOX_ID ||
    (await listInboxes(deps.client)).inboxes[0]?.inbox_id;
  if (!inboxId) throw new Error('No AgentMail inbox configured');
  const previous = deps.db.prepare("SELECT v FROM kv WHERE k = 'last_poll_at'").get() as
    | { v: string }
    | undefined;
  const after = new Date(
    (previous ? Date.parse(previous.v) : Date.now() - 10 * 60_000) - 10 * 60_000,
  ).toISOString();
  const messages = await mail.listMessages(inboxId, after);

  for (const message of messages) {
    if (
      deps.db
        .prepare('SELECT 1 FROM inbound_seen WHERE agentmail_message_id = ?')
        .get(message.message_id)
    )
      continue;
    const email = senderEmail(message.from);
    const member = email ? getMemberByEmail(deps.db, email) : undefined;
    if (!member) {
      deps.db
        .prepare(
          'INSERT INTO inbound_seen (agentmail_message_id, outcome, created_at) VALUES (?, ?, ?)',
        )
        .run(message.message_id, 'ignored_sender', new Date().toISOString());
      continue;
    }
    const householdId = String(member.household_id);
    const memberId = String(member.id);
    const openAsk = deps.db
      .prepare(
        "SELECT * FROM asks WHERE household_id = ? AND agentmail_thread_id = ? AND status = 'open' ORDER BY created_at LIMIT 1",
      )
      .get(householdId, message.thread_id) as { id: string } | undefined;
    if (openAsk) {
      try {
        const outcome = await (deps.replyHandler ?? handleAskReply)(deps, {
          askId: openAsk.id,
          memberId: memberId,
          text: message.text ?? '',
          via: 'email',
        });
        deps.db
          .prepare(
            'INSERT INTO inbound_seen (agentmail_message_id, outcome, created_at) VALUES (?, ?, ?)',
          )
          .run(message.message_id, outcome, new Date().toISOString());
      } catch (error) {
        log.warn(
          { event: 'inbound_reply_failed', messageId: message.message_id, askId: openAsk.id },
          error instanceof Error ? error.message : String(error),
        );
      }
      continue;
    }

    const attachments = attachmentList(message.attachments).slice(0, 10);
    let processed = 0;
    for (const attachment of attachments) {
      const attachmentId = String(attachment.attachment_id ?? '');
      if (!attachmentId) continue;
      try {
        const metadata = await mail.getAttachment(inboxId, message.message_id, attachmentId);
        if (metadata.size !== undefined && metadata.size > MAX_FILE_BYTES) continue;
        const bytes = await mail.downloadAttachment(metadata.download_url);
        const intake = await intakeEmailAttachment({
          bytes,
          householdId,
          memberId,
          receivedAt: message.timestamp ?? new Date().toISOString(),
          dataDir: deps.config.MAILKEEP_DATA_DIR,
          db: deps.db,
        });
        await deps.queue.enqueue(intake.letterId);
        processed += 1;
      } catch (error) {
        log.warn(
          { event: 'inbound_attachment_failed', messageId: message.message_id, attachmentId },
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    deps.db
      .prepare(
        'INSERT INTO inbound_seen (agentmail_message_id, outcome, created_at) VALUES (?, ?, ?)',
      )
      .run(
        message.message_id,
        processed > 0 ? 'processed' : 'no_attachments',
        new Date().toISOString(),
      );
  }

  deps.db
    .prepare(
      "INSERT INTO kv (k, v) VALUES ('last_poll_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    )
    .run(new Date().toISOString());
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let lastPingAt = 0;
const MIN_PING_INTERVAL_MS = 5_000;

export function hooksRoutes(deps: HookDeps): Hono {
  const app = new Hono();
  app.post('/hooks/agentmail', (context) => {
    const now = Date.now();
    if (now - lastPingAt < MIN_PING_INTERVAL_MS) return context.json({ accepted: true }, 202);
    lastPingAt = now;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => {
      void (deps.poll ?? pollAgentMail)(deps).catch((error: unknown) => {
        log.error(
          { event: 'agentmail_poll_failed' },
          error instanceof Error ? error.message : String(error),
        );
      });
    }, 2000);
    pollTimer.unref();
    return context.json({ accepted: true }, 202);
  });
  return app;
}
