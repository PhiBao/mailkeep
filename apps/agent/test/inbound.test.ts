import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
