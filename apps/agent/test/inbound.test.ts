import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';
import { GatewayClient } from '../src/gateway/client.js';
import { type InboundMessage, type MailAdapter, pollAgentMail } from '../src/http/routes/hooks.js';
import type { PipelineQueue } from '../src/pipeline/queue.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-inbound-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  const household = createHousehold(db, {
    id: 'hh_test',
    name: 'Test',
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    demo: false,
  });
  addMember(db, {
    householdId: household.id,
    email: 'kiter7396+mom@gmail.com',
    displayName: 'Ruth',
    role: 'parent',
  });
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

function deps() {
  const config = loadConfig({
    MAILKEEP_DATA_DIR: directory,
    MAILKEEP_AGENTMAIL_INBOX_ID: 'kiter@agentmail.to',
  });
  return {
    config,
    db,
    client: new GatewayClient({ config }),
    queue: { enqueue: async () => {} } as PipelineQueue,
  };
}

function message(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    message_id: 'message_1',
    thread_id: 'thread_1',
    subject: 'A letter',
    timestamp: '2026-11-24T12:00:00Z',
    from: 'Ruth <kiter7396+mom@gmail.com>',
    attachments: [{ attachment_id: 'attachment_1' }],
    ...overrides,
  };
}

function adapter(messages: InboundMessage[], bytes: Buffer): MailAdapter {
  return {
    listMessages: async () => messages,
    getAttachment: async () => ({
      attachment_id: 'attachment_1',
      download_url: 'https://cdn.example/file',
    }),
    downloadAttachment: async () => bytes,
  };
}

describe('AgentMail intake', () => {
  it('ignores unknown senders', async () => {
    await pollAgentMail(
      deps(),
      adapter([message({ from: 'stranger@example.com' })], Buffer.from('x')),
    );
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(0);
    expect(
      (db.prepare('SELECT outcome FROM inbound_seen').get() as { outcome: string }).outcome,
    ).toBe('ignored_sender');
  });

  it('processes a duplicate message only once', async () => {
    const bytes = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    const mail = adapter([message()], bytes);
    await pollAgentMail(deps(), mail);
    await pollAgentMail(deps(), mail);
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT count(*) AS n FROM inbound_seen').get() as { n: number }).n).toBe(1);
  });

  it('shares one provider poll when two polls overlap', async () => {
    const bytes = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mail = adapter([message()], bytes);
    const listMessages = vi.fn(async () => {
      await gate;
      return [message()];
    });
    mail.listMessages = listMessages;
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const queue = { enqueue } as unknown as PipelineQueue;
    const first = pollAgentMail({ ...deps(), queue }, mail);
    const second = pollAgentMail({ ...deps(), queue }, mail);
    expect(listMessages).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect((db.prepare('SELECT count(*) AS n FROM inbound_seen').get() as { n: number }).n).toBe(1);
  });

  it('does not enqueue identical attachments from two messages twice', async () => {
    const bytes = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    const enqueue = vi.fn().mockResolvedValue(undefined);
    await pollAgentMail(
      { ...deps(), queue: { enqueue } as unknown as PipelineQueue },
      adapter([message({ message_id: 'message_1' }), message({ message_id: 'message_2' })], bytes),
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT count(*) AS n FROM inbound_seen').get() as { n: number }).n).toBe(2);
  });

  it('releases a failed reply claim so the next poll can retry', async () => {
    const family = addMember(db, {
      householdId: 'hh_test',
      email: 'kiter7396@gmail.com',
      displayName: 'Sarah',
      role: 'family',
    });
    db.prepare(
      `INSERT INTO asks
        (id, household_id, letter_id, qtype, question, evidence, options_json, status,
         agentmail_thread_id, created_at)
       VALUES ('ask_1', 'hh_test', NULL, 'check', 'Check this', 'Evidence', '[]', 'open', 'thread_1', ?)`,
    ).run(new Date().toISOString());
    const replyHandler = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('answered');
    const mail = adapter(
      [message({ from: 'Sarah <kiter7396@gmail.com>', text: 'HANDLED IT', attachments: [] })],
      Buffer.from('x'),
    );
    await pollAgentMail({ ...deps(), replyHandler }, mail);
    expect((db.prepare('SELECT count(*) AS n FROM inbound_seen').get() as { n: number }).n).toBe(0);
    await pollAgentMail({ ...deps(), replyHandler }, mail);
    expect(replyHandler).toHaveBeenCalledTimes(2);
    expect(replyHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ db }),
      expect.objectContaining({ memberId: family.id }),
    );
    expect(
      (db.prepare('SELECT outcome FROM inbound_seen').get() as { outcome: string }).outcome,
    ).toBe('answered');
  });

  it('routes a family reply to the matching open ask instead of intake', async () => {
    const family = addMember(db, {
      householdId: 'hh_test',
      email: 'kiter7396@gmail.com',
      displayName: 'Sarah',
      role: 'family',
    });
    db.prepare(
      `INSERT INTO asks
        (id, household_id, letter_id, qtype, question, evidence, options_json, status,
         agentmail_thread_id, created_at)
       VALUES ('ask_1', 'hh_test', NULL, 'check', 'Check this', 'Evidence', '[]', 'open', 'thread_1', ?)`,
    ).run(new Date().toISOString());
    const replyHandler = vi.fn().mockResolvedValue('answered');
    await pollAgentMail(
      { ...deps(), replyHandler },
      adapter(
        [message({ from: 'Sarah <kiter7396@gmail.com>', text: 'HANDLED IT', attachments: [] })],
        Buffer.from('x'),
      ),
    );
    expect(replyHandler).toHaveBeenCalledWith(expect.objectContaining({ db }), {
      askId: 'ask_1',
      memberId: family.id,
      text: 'HANDLED IT',
      via: 'email',
    });
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(0);
    expect(
      (db.prepare('SELECT outcome FROM inbound_seen').get() as { outcome: string }).outcome,
    ).toBe('answered');
  });

  it('routes a family PAID reply on a sent alert thread instead of intake', async () => {
    const family = addMember(db, {
      householdId: 'hh_test',
      email: 'kiter7396@gmail.com',
      displayName: 'Sarah',
      role: 'family',
    });
    db.prepare(
      `INSERT INTO outbox
        (id, household_id, to_email, kind, subject, body_text, related_id, status,
         agentmail_thread_id, created_at)
       VALUES ('out_alert', 'hh_test', 'kiter7396@gmail.com', 'family_alert', 'Second notice',
         'Reply PAID', 'ltr_alert', 'sent', 'thread_1', ?)`,
    ).run(new Date().toISOString());
    const alertReplyHandler = vi.fn().mockResolvedValue('answered');
    await pollAgentMail(
      { ...deps(), alertReplyHandler },
      adapter(
        [message({ from: 'Sarah <kiter7396@gmail.com>', text: 'PAID', attachments: [] })],
        Buffer.from('x'),
      ),
    );
    expect(alertReplyHandler).toHaveBeenCalledWith(expect.objectContaining({ db }), {
      alertId: 'out_alert',
      memberId: family.id,
      text: 'PAID',
      via: 'email',
    });
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(0);
    expect(
      (db.prepare('SELECT outcome FROM inbound_seen').get() as { outcome: string }).outcome,
    ).toBe('answered');
  });

  it('caps a message at ten attachments', async () => {
    const bytes = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    let downloads = 0;
    const mail = adapter(
      [
        message({
          attachments: Array.from({ length: 11 }, (_, index) => ({
            attachment_id: `attachment_${index}`,
          })),
        }),
      ],
      bytes,
    );
    mail.downloadAttachment = async () => {
      downloads += 1;
      return bytes;
    };
    await pollAgentMail(deps(), mail);
    expect(downloads).toBe(10);
  });
});
