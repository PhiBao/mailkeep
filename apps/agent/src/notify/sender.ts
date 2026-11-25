import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import { listInboxes, replyToMessage, sendMessage } from '../providers/agentmail.js';
import { log } from '../util/log.js';

export interface SenderDeps {
  db: DB;
  client: GatewayClient;
  inboxId: string;
}

interface OutboxRow {
  id: string;
  household_id: string;
  to_email: string;
  subject: string;
  body_text: string;
  agentmail_message_id: string | null;
  agentmail_thread_id: string | null;
  kind: string;
  related_id: string | null;
  attempts: number;
}

function replyMessageId(db: DB, row: OutboxRow): string | null {
  if (row.agentmail_message_id) return row.agentmail_message_id;
  if (!row.agentmail_thread_id || row.kind !== 'ask' || !row.related_id) return null;
  const askId = row.related_id.split(':')[0];
  const original = db
    .prepare(
      `SELECT agentmail_message_id FROM outbox
        WHERE household_id = ? AND related_id = ? AND kind = 'ask' AND status = 'sent'
          AND agentmail_message_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(row.household_id, askId) as { agentmail_message_id: string } | undefined;
  return original?.agentmail_message_id ?? null;
}

export async function sendPending(deps: SenderDeps): Promise<void> {
  const rows = deps.db
    .prepare(
      "SELECT * FROM outbox WHERE status = 'pending' AND attempts < 3 ORDER BY created_at LIMIT 20",
    )
    .all() as OutboxRow[];
  if (rows.length === 0) return;
  const inboxId = deps.inboxId || (await listInboxes(deps.client)).inboxes[0]?.inbox_id;
  if (!inboxId) throw new Error('No AgentMail inbox configured');
  for (const row of rows) {
    try {
      const replyTarget = replyMessageId(deps.db, row);
      const sent = replyTarget
        ? await replyToMessage(deps.client, {
            inboxId,
            messageId: replyTarget,
            text: row.body_text,
            subject: row.subject,
          })
        : await sendMessage(deps.client, {
            inboxId,
            to: row.to_email,
            subject: row.subject,
            text: row.body_text,
          });
      deps.db
        .prepare(
          "UPDATE outbox SET status = 'sent', agentmail_message_id = ?, agentmail_thread_id = ?, sent_at = ?, attempts = attempts + 1 WHERE id = ?",
        )
        .run(sent.message_id, sent.thread_id, new Date().toISOString(), row.id);
      if (row.kind === 'ask' && row.related_id) {
        deps.db
          .prepare('UPDATE asks SET agentmail_thread_id = ? WHERE id = ? AND household_id = ?')
          .run(sent.thread_id, row.related_id, row.household_id);
      }
    } catch (error) {
      const attempts = row.attempts + 1;
      deps.db
        .prepare('UPDATE outbox SET attempts = ?, status = ? WHERE id = ?')
        .run(attempts, attempts >= 3 ? 'failed' : 'pending', row.id);
      log.warn(
        { event: 'outbox_send_failed', outboxId: row.id, attempts },
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export function startSenderWorker(deps: SenderDeps): void {
  const timer = setInterval(() => {
    void sendPending(deps).catch((error: unknown) => {
      log.error(
        { event: 'outbox_worker_failed' },
        error instanceof Error ? error.message : String(error),
      );
    });
  }, 5000);
  timer.unref();
  void sendPending(deps);
}
