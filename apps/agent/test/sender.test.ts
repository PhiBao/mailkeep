import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { createHousehold } from '../src/db/repo.js';
import { GatewayClient } from '../src/gateway/client.js';
import { sendPending } from '../src/notify/sender.js';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  replyToMessage: vi.fn(),
  listInboxes: vi.fn(),
}));
vi.mock('../src/providers/agentmail.js', () => mocks);

let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-sender-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  createHousehold(db, {
    id: 'hh_test',
    name: 'Test',
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    demo: false,
  });
  vi.clearAllMocks();
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('outbox sender', () => {
  it('stores the sent thread on its ask so replies can be matched', async () => {
    db.prepare(
      `INSERT INTO asks
        (id, household_id, letter_id, qtype, question, evidence, options_json, status, created_at)
       VALUES ('ask_1', 'hh_test', NULL, 'check', 'Check this', 'Evidence', '[]', 'open', ?)`,
    ).run(new Date().toISOString());
    db.prepare(
      `INSERT INTO outbox
        (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
       VALUES ('out_1', 'hh_test', 'kiter7396@gmail.com', 'ask', 'Question', 'Body', 'ask_1', 'pending', ?)`,
    ).run(new Date().toISOString());
    mocks.sendMessage.mockResolvedValue({ message_id: 'msg_1', thread_id: 'thread_1' });
    const config = loadConfig({ MAILKEEP_DATA_DIR: directory });
    await sendPending({ db, client: new GatewayClient({ config }), inboxId: 'inbox_1' });
    expect(
      (
        db.prepare('SELECT agentmail_thread_id FROM asks WHERE id = ?').get('ask_1') as {
          agentmail_thread_id: string;
        }
      ).agentmail_thread_id,
    ).toBe('thread_1');
    expect(
      (db.prepare('SELECT status FROM outbox WHERE id = ?').get('out_1') as { status: string })
        .status,
    ).toBe('sent');
  });
});
