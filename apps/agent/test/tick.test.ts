import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTick, type TickDeps } from '../src/chase/tick.js';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';
import { GatewayClient } from '../src/gateway/client.js';
import { tickRoutes } from '../src/http/routes/tick.js';
import type { PipelineQueue } from '../src/pipeline/queue.js';

let directory: string;
let db: DB;
let current: number;
let poll: ReturnType<typeof vi.fn>;
let purge: ReturnType<typeof vi.fn>;
let syncCase: ReturnType<typeof vi.fn>;

function household(): void {
  createHousehold(db, {
    id: 'hh_test',
    name: "Ruth's mail",
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    demo: false,
  });
  addMember(db, {
    householdId: 'hh_test',
    email: 'kiter7396@gmail.com',
    displayName: 'Sarah',
    role: 'family',
  });
}

function seedCase(input: { id: string; status?: string; dueDate: string }): void {
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, amount_cents, due_date,
       second_notice, contradiction, created_at, updated_at)
     VALUES (?, 'hh_test', ?, 'Riverbend Water Utility', 'bill', ?, 8417, ?, 0, 0, ?, ?)`,
  ).run(
    input.id,
    input.id,
    input.status ?? 'open',
    input.dueDate,
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

function seedLetter(input: { id: string; lane: string; receivedAt: string }): void {
  db.prepare(
    `INSERT INTO letters
      (id, household_id, source, trial, received_at, status, mime, sha256, local_path,
       title, lane, kind, created_at, updated_at)
     VALUES (?, 'hh_test', 'upload', 0, ?, 'done', 'image/jpeg', ?, ?, ?, ?, 'bill', ?, ?)`,
  ).run(
    input.id,
    input.receivedAt,
    `sha_${input.id}`,
    `/tmp/${input.id}.jpg`,
    input.id,
    input.lane,
    input.receivedAt,
    input.receivedAt,
  );
}

function deps(): TickDeps {
  const config = loadConfig({
    MAILKEEP_DATA_DIR: directory,
    MAILKEEP_PUBLIC_URL: 'https://mailkeep.example',
    MAILKEEP_TICK_MIN_INTERVAL_S: '300',
  });
  return {
    config,
    db,
    client: new GatewayClient({ config }),
    queue: { enqueue: async () => {} } as unknown as PipelineQueue,
    now: () => new Date(current),
    poll,
    purge,
    syncCase,
  };
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-tick-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  current = Date.parse('2026-12-09T12:00:00.000Z');
  poll = vi.fn().mockResolvedValue(undefined);
  purge = vi.fn().mockResolvedValue(0);
  syncCase = vi.fn().mockResolvedValue(undefined);
  household();
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('chase tick', () => {
  it('asks once at due-in-five, alerts once when overdue, and rate-limits the tick', async () => {
    seedCase({ id: 'case_due', dueDate: '2026-12-14' });
    seedCase({ id: 'case_overdue', dueDate: '2026-12-08' });
    seedCase({ id: 'case_later', dueDate: '2026-12-17' });
    seedCase({ id: 'case_paid', status: 'paid', dueDate: '2026-12-14' });
    const first = await runTick(deps());
    expect(first).toMatchObject({ ran: true, asks: 1, overdue: 1 });
    expect(poll).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(syncCase).toHaveBeenCalledTimes(2);
    expect(
      (db.prepare("SELECT count(*) AS n FROM asks WHERE qtype = 'paid'").get() as { n: number }).n,
    ).toBe(1);
    expect(
      (db.prepare("SELECT status FROM cases WHERE id = 'case_overdue'").get() as { status: string })
        .status,
    ).toBe('overdue');
    expect(
      (
        db.prepare("SELECT count(*) AS n FROM outbox WHERE kind = 'family_alert'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    expect((await runTick(deps())).ran).toBe(false);

    current += 301_000;
    const second = await runTick(deps());
    expect(second).toMatchObject({ ran: true, asks: 0, overdue: 0 });
    expect(
      (db.prepare("SELECT count(*) AS n FROM asks WHERE qtype = 'paid'").get() as { n: number }).n,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT count(*) AS n FROM outbox WHERE kind = 'family_alert'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });

  it('queues one evening digest per household day after 18:00', async () => {
    current = Date.parse('2026-12-10T01:00:00.000Z');
    seedLetter({ id: 'ltr_headsup', lane: 'headsup', receivedAt: '2026-12-09T12:00:00.000Z' });
    seedLetter({ id: 'ltr_handled', lane: 'handled', receivedAt: '2026-12-09T13:00:00.000Z' });
    expect((await runTick(deps())).digests).toBe(1);
    expect(
      (db.prepare("SELECT count(*) AS n FROM outbox WHERE kind = 'digest'").get() as { n: number })
        .n,
    ).toBe(1);
    const row = db.prepare("SELECT body_text FROM outbox WHERE kind = 'digest'").get() as {
      body_text: string;
    };
    expect(row.body_text).toContain('Heads-up: ltr_headsup');
    expect(row.body_text).toContain('1 letters filed quietly.');
    current += 301_000;
    expect((await runTick(deps())).digests).toBe(0);
    expect(
      (db.prepare("SELECT count(*) AS n FROM outbox WHERE kind = 'digest'").get() as { n: number })
        .n,
    ).toBe(1);
  });

  it('returns 202 immediately while the tick runs in the background', async () => {
    const app = new Hono();
    app.route('/', tickRoutes(deps()));
    const response = await app.request('https://mailkeep.example/tick', { method: 'POST' });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    await vi.waitFor(() => expect(purge).toHaveBeenCalledTimes(1));
  });

  it('expires old login tokens, sessions and open asks', async () => {
    const memberId = (
      db.prepare("SELECT id FROM members WHERE role = 'family'").get() as { id: string }
    ).id;
    db.prepare('INSERT INTO login_tokens (token_hash, member_id, expires_at) VALUES (?, ?, ?)').run(
      'old_token',
      memberId,
      '2026-12-01T00:00:00.000Z',
    );
    db.prepare(
      'INSERT INTO sessions (token_hash, member_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    ).run('old_session', memberId, '2026-12-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
    db.prepare(
      `INSERT INTO asks
        (id, household_id, qtype, question, evidence, options_json, status, created_at)
       VALUES ('ask_old', 'hh_test', 'check', 'Check', 'Evidence', '[]', 'open', ?)`,
    ).run('2026-11-01T00:00:00.000Z');
    await runTick(deps());
    expect((db.prepare('SELECT count(*) AS n FROM login_tokens').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
    expect(
      (db.prepare("SELECT status FROM asks WHERE id = 'ask_old'").get() as { status: string })
        .status,
    ).toBe('expired');
  });
});
