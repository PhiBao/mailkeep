import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseSchema, letterSchema, todaySchema } from '@mailkeep/shared';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';
import type { GatewayClient } from '../src/gateway/client.js';
import {
  DEMO_SAMPLE_IDS,
  DEMO_TRIAL_TTL_MS,
  type DemoDeps,
  demoRoutes,
  purgeExpiredTrials,
} from '../src/http/routes/demo.js';
import { type IntakeInput, type IntakeResult, intakeFile } from '../src/pipeline/intake.js';

const ORIGIN = 'https://mailkeep.test';
const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const HOUR_MS = 60 * 60_000;
const SAMPLE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

let directory: string;
let db: DB;
let config: ReturnType<typeof loadConfig>;
let app: Hono;
let currentTime: number;
let enqueue: ReturnType<typeof vi.fn>;
let readSample: ReturnType<typeof vi.fn>;
let intake: ReturnType<typeof vi.fn>;
let nextLetter: number;

function clock(): Date {
  return new Date(currentTime);
}

function mount(overrides: Partial<DemoDeps> = {}): Hono {
  const instance = new Hono();
  instance.route(
    '/',
    demoRoutes({
      config,
      db,
      queue: { enqueue },
      now: clock,
      readFile: readSample,
      intake,
      ...overrides,
    }),
  );
  return instance;
}

function get(pathname: string, headers: HeadersInit = {}): Promise<Response> {
  return app.request(`${ORIGIN}${pathname}`, { headers });
}

function run(pathname: string, headers: HeadersInit = {}, body?: string): Promise<Response> {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  return app.request(`${ORIGIN}${pathname}`, {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
}

async function seedCase(input: {
  id: string;
  householdId?: string;
  title?: string;
}): Promise<void> {
  const now = clock().toISOString();
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Riverbend Water Utility', 'bill', 'open', ?, ?)`,
  ).run(input.id, input.householdId ?? 'hh_demo', input.title ?? `Case ${input.id}`, now, now);
}

async function seedLetter(input: {
  id: string;
  householdId?: string;
  source?: string;
  trial?: number;
  caseId?: string | null;
  title?: string;
  transcript?: string;
  createdAt?: string;
  lane?: string | null;
}): Promise<string> {
  const householdId = input.householdId ?? 'hh_demo';
  const localPath = path.join(directory, `${input.id}.jpg`);
  await writeFile(localPath, SAMPLE_BYTES);
  const createdAt = input.createdAt ?? clock().toISOString();
  db.prepare(
    `INSERT INTO letters
      (id, household_id, source, trial, submitted_by, received_at, status, mime, sha256,
        local_path, transcript, sender_org, title, summary_parent, todo_parent, kind, lane,
        case_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, 'done', 'image/jpeg', ?, ?, ?, 'Riverbend Water Utility', ?,
        'Summary', 'Todo', 'bill', ?, ?, ?, ?)`,
  ).run(
    input.id,
    householdId,
    input.source ?? 'seed',
    input.trial ?? 0,
    createdAt,
    `sha_${input.id}`,
    localPath,
    input.transcript ?? `Transcript for ${input.id}`,
    input.title ?? `Letter ${input.id}`,
    input.lane ?? 'headsup',
    input.caseId ?? null,
    createdAt,
    createdAt,
  );
  return localPath;
}

function seedDecision(letterId: string, householdId = 'hh_demo'): void {
  db.prepare(
    `INSERT INTO decisions
      (id, letter_id, household_id, model_id, request_json, response_json, latency_ms, created_at)
      VALUES (?, ?, ?, 'jev-test', ?, ?, 123, ?)`,
  ).run(
    `dec_${letterId}`,
    letterId,
    householdId,
    JSON.stringify({
      state: { past: [{ id: 'ltr_private' }] },
      questions: { same_matter_0: {} },
    }),
    JSON.stringify({ model: 'jev-test', answers: { same_matter_0: { type: 'noul', noul: 0.9 } } }),
    clock().toISOString(),
  );
}

function mockClient(): { client: GatewayClient; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn(async () => ({
    status: 200,
    headers: new Headers(),
    text: '{}',
    json: {},
  }));
  return { client: { request } as unknown as GatewayClient, request };
}

beforeEach(async () => {
  vi.stubEnv('MAILKEEP_PINECONE_INDEX', 'mailkeep-letters');
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-demo-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  currentTime = NOW;
  nextLetter = 0;
  config = loadConfig({
    MAILKEEP_PUBLIC_URL: ORIGIN,
    MAILKEEP_DATA_DIR: directory,
    MAILKEEP_DEMO_HOUSEHOLD_ID: 'hh_demo',
  });
  createHousehold(db, {
    id: 'hh_demo',
    name: 'Demo home',
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    demo: true,
    pineconeNamespace: 'ns_demo',
  });
  createHousehold(db, {
    id: 'hh_private',
    name: 'Private home',
    parentDisplay: 'Private parent',
    timezone: 'America/Chicago',
    demo: false,
    pineconeNamespace: 'ns_private',
  });
  addMember(db, {
    householdId: 'hh_demo',
    email: 'parent@example.com',
    displayName: 'Ruth',
    role: 'parent',
  });
  addMember(db, {
    householdId: 'hh_private',
    email: 'private@example.com',
    displayName: 'Private',
    role: 'parent',
  });
  enqueue = vi.fn().mockResolvedValue(undefined);
  readSample = vi.fn().mockResolvedValue(SAMPLE_BYTES);
  intake = vi.fn(async (input: IntakeInput): Promise<IntakeResult> => {
    nextLetter += 1;
    return {
      duplicate: false,
      letterId: `ltr_sample_${nextLetter}`,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      mime: 'image/jpeg',
      localPath: path.join(directory, `sample_${nextLetter}.jpg`),
    };
  });
  app = mount();
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('public demo reads', () => {
  it('lists exactly the six approved samples and serves only their known images', async () => {
    const response = await get('/api/demo/samples');
    expect(response.status).toBe(200);
    const samples = (await response.json()) as Array<Record<string, unknown>>;
    expect(samples.map((sample) => sample.id)).toEqual([...DEMO_SAMPLE_IDS]);
    expect(samples).toEqual([
      expect.objectContaining({
        id: 'L02',
        title: expect.any(String),
        description: expect.any(String),
      }),
      expect.objectContaining({
        id: 'L09',
        title: expect.any(String),
        description: expect.any(String),
      }),
      expect.objectContaining({
        id: 'L11',
        title: expect.any(String),
        description: expect.any(String),
      }),
      expect.objectContaining({
        id: 'L05',
        title: expect.any(String),
        description: expect.any(String),
      }),
      expect.objectContaining({
        id: 'L26',
        title: expect.any(String),
        description: expect.any(String),
      }),
      expect.objectContaining({
        id: 'L28',
        title: expect.any(String),
        description: expect.any(String),
      }),
    ]);
    for (const sample of samples) {
      expect(Object.keys(sample).sort()).toEqual([
        'description',
        'id',
        'imageUrl',
        'photo',
        'title',
      ]);
      expect(sample.photo).toBe('normal');
      expect(sample.imageUrl).toBe(`/api/demo/samples/${sample.id}/image`);
    }

    const image = await get('/api/demo/samples/L02/image');
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toBe('image/jpeg');
    expect(image.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(SAMPLE_BYTES);
    expect(readSample).toHaveBeenCalledWith(path.join(ROOT, 'testset/out/L02.jpg'));

    for (const pathname of [
      '/api/demo/samples/L01/image',
      '/api/demo/samples/%2E%2E%2FL01/image',
      '/api/demo/samples/unknown/image',
    ]) {
      expect((await get(pathname)).status, pathname).toBe(404);
    }
  });

  it('returns scoped validated DTOs with demo URLs and no private paths or transcripts', async () => {
    await seedCase({ id: 'case_demo' });
    await seedCase({ id: 'case_private', householdId: 'hh_private' });
    const demoPath = await seedLetter({
      id: 'ltr_demo',
      caseId: 'case_demo',
      transcript: 'DEMO TRANSCRIPT',
      lane: 'handled',
    });
    await seedLetter({
      id: 'ltr_private',
      householdId: 'hh_private',
      caseId: 'case_private',
      transcript: 'PRIVATE HOUSEHOLD SECRET TRANSCRIPT',
    });
    seedDecision('ltr_demo');
    seedDecision('ltr_private', 'hh_private');
    db.prepare(
      `INSERT INTO case_events
        (id, household_id, case_id, letter_id, type, actor, detail_json, created_at)
        VALUES ('evt_demo', 'hh_demo', 'case_demo', 'ltr_demo', 'opened', 'agent', '{}', ?)`,
    ).run('2026-11-23T00:00:00.000Z');
    db.prepare(
      `INSERT INTO outbox
        (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
        VALUES ('out_demo', 'hh_demo', 'parent@example.com', 'parent_note', 'Demo', 'Body',
          'ltr_demo', 'suppressed', ?)`,
    ).run(clock().toISOString());

    const todayResponse = await get('/api/demo/today');
    expect(todayResponse.status).toBe(200);
    const today = todaySchema.parse(await todayResponse.json());
    expect(today.household).toMatchObject({ id: 'hh_demo', isDemo: true });
    expect(today.recent.map((letter) => letter.id)).toEqual(['ltr_demo']);
    expect(today.recent[0]?.imageUrl).toBe('/api/demo/letters/ltr_demo/image');
    expect(today.handledThisWeek.count).toBe(1);
    expect(today.handledThisWeek.items[0]?.imageUrl).toBe('/api/demo/letters/ltr_demo/image');

    const caseResponse = await get('/api/demo/cases/case_demo');
    expect(caseResponse.status).toBe(200);
    const caseDto = caseSchema.parse(await caseResponse.json());
    expect(caseDto.letters[0]?.imageUrl).toBe('/api/demo/letters/ltr_demo/image');
    expect(caseDto.events[0]?.createdAt).toBe(caseDto.letters[0]?.receivedAt);

    const letterResponse = await get('/api/demo/letters/ltr_demo');
    expect(letterResponse.status).toBe(200);
    const letterDto = letterSchema.parse(await letterResponse.json());
    expect(letterDto).toMatchObject({
      householdId: 'hh_demo',
      transcript: 'DEMO TRANSCRIPT',
      imageUrl: '/api/demo/letters/ltr_demo/image',
      decision: { rawResponseUrl: '/api/demo/letters/ltr_demo/decision' },
    });
    expect(letterDto.recall).toEqual([]);

    const decision = await get('/api/demo/letters/ltr_demo/decision');
    expect(decision.status).toBe(200);
    expect(decision.headers.get('Cache-Control')).toBe('no-store');
    expect(await decision.json()).toMatchObject({ model: 'jev-test' });

    const image = await get('/api/demo/letters/ltr_demo/image');
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(SAMPLE_BYTES);
    expect(readSample).toHaveBeenCalledWith(demoPath);

    for (const pathname of [
      '/api/demo/cases/case_private',
      '/api/demo/letters/ltr_private',
      '/api/demo/letters/ltr_private/image',
      '/api/demo/letters/ltr_private/decision',
      '/api/demo/letters/missing',
      '/api/demo/cases/missing',
    ]) {
      const response = await get(pathname);
      expect(response.status, pathname).toBe(404);
      expect(await response.text()).not.toContain('PRIVATE HOUSEHOLD SECRET');
    }
    expect(JSON.stringify(today)).not.toContain('PRIVATE HOUSEHOLD SECRET');
    expect(JSON.stringify(letterDto)).not.toContain(directory);
    expect(JSON.stringify(letterDto)).not.toContain('local_path');
    expect(readSample).not.toHaveBeenCalledWith(path.join(directory, 'ltr_private.jpg'));
  });

  it('fails closed when the configured household is not a demo household', async () => {
    config = loadConfig({
      MAILKEEP_DATA_DIR: directory,
      MAILKEEP_DEMO_HOUSEHOLD_ID: 'hh_private',
    });
    app = mount();
    expect((await get('/api/demo/today')).status).toBe(404);
    expect((await get('/api/demo/samples')).status).toBe(404);
    expect((await run('/api/demo/samples/L02/run')).status).toBe(404);
    expect(readSample).not.toHaveBeenCalled();
    expect(intake).not.toHaveBeenCalled();
  });
});

describe('demo sample runs', () => {
  it('validates the id before reading or rate limiting', async () => {
    for (const id of ['L01', 'unknown', '%2E%2E%2FL02']) {
      expect((await run(`/api/demo/samples/${id}/run`)).status).toBe(404);
    }
    expect(readSample).not.toHaveBeenCalled();
    expect(intake).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('runs a known output through intake and the queue as a demo trial', async () => {
    db.prepare("UPDATE households SET clock_offset_days = 1 WHERE id = 'hh_demo'").run();
    const response = await run(
      '/api/demo/samples/L02/run',
      {},
      JSON.stringify({ upload: 'ignored', localPath: '/private/upload.jpg' }),
    );
    expect(response.status).toBe(202);
    const dto = letterSchema.parse(await response.json());
    expect(dto).toMatchObject({
      householdId: 'hh_demo',
      source: 'sample',
      trial: true,
      submittedBy: null,
      status: 'queued',
      transcript: '',
      imageUrl: '/api/demo/letters/ltr_sample_1/image',
    });
    expect(readSample).toHaveBeenCalledTimes(1);
    expect(readSample).toHaveBeenCalledWith(path.join(ROOT, 'testset/out/L02.jpg'));
    expect(intake).toHaveBeenCalledWith({
      bytes: SAMPLE_BYTES,
      householdId: 'hh_demo',
      dataDir: directory,
      db,
    });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith('ltr_sample_1');
    expect(db.prepare('SELECT * FROM letters WHERE id = ?').get('ltr_sample_1')).toMatchObject({
      household_id: 'hh_demo',
      source: 'sample',
      trial: 1,
      submitted_by: null,
      status: 'queued',
      received_at: new Date(NOW + 86_400_000).toISOString(),
      created_at: clock().toISOString(),
    });
  });

  it('uses the real intake implementation by default without provider calls', async () => {
    app = mount({
      readFile: async (filePath) => readFile(filePath),
      intake: intakeFile,
    });
    const response = await run('/api/demo/samples/L26/run');
    expect(response.status).toBe(202);
    const dto = letterSchema.parse(await response.json());
    expect(dto).toMatchObject({ source: 'sample', trial: true, status: 'queued' });
    const row = db.prepare('SELECT local_path FROM letters WHERE id = ?').get(dto.id) as {
      local_path: string;
    };
    await expect(access(row.local_path)).resolves.toBeUndefined();
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(dto.id);
  });

  it('reuses a recent identical trial without intake or another queue job', async () => {
    const first = await run('/api/demo/samples/L09/run');
    expect(first.status).toBe(202);
    const firstDto = letterSchema.parse(await first.json());
    const second = await run('/api/demo/samples/L09/run');
    expect(second.status).toBe(202);
    expect(letterSchema.parse(await second.json())).toEqual(firstDto);
    expect(intake).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(1);
  });

  it('enforces five runs per IP and thirty per hour globally, then opens a new window', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect(
        (await run('/api/demo/samples/L11/run', { 'X-Forwarded-For': '192.0.2.1' })).status,
      ).toBe(202);
    }
    const ipLimited = await run('/api/demo/samples/L11/run', {
      'X-Forwarded-For': '192.0.2.1',
    });
    expect(ipLimited.status).toBe(429);
    expect(ipLimited.headers.get('Retry-After')).toBe('3600');
    expect(await ipLimited.json()).toEqual({ error: 'rate_limited' });
    expect(readSample).toHaveBeenCalledTimes(5);

    for (let index = 0; index < 25; index += 1) {
      expect(
        (
          await run('/api/demo/samples/L11/run', {
            'X-Forwarded-For': `192.0.2.${(index % 5) + 2}`,
          })
        ).status,
      ).toBe(202);
    }
    const globalLimited = await run('/api/demo/samples/L11/run', {
      'X-Forwarded-For': '192.0.2.3',
    });
    expect(globalLimited.status).toBe(429);
    expect(readSample).toHaveBeenCalledTimes(30);
    expect(intake).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);

    db.prepare('DELETE FROM letters').run();
    currentTime += HOUR_MS;
    expect(
      (await run('/api/demo/samples/L11/run', { 'X-Forwarded-For': '192.0.2.1' })).status,
    ).toBe(202);
    expect(intake).toHaveBeenCalledTimes(2);
  });

  it('maps intake failures without creating or queueing a letter', async () => {
    const { IntakeError } = await import('../src/pipeline/intake.js');
    intake.mockRejectedValueOnce(new IntakeError('unsupported', 'Unsupported'));
    const response = await run('/api/demo/samples/L05/run');
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'unsupported' });
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('trial purge', () => {
  it('deletes expired trial rows, local files, and Pinecone vectors but keeps Box files alone', async () => {
    await seedCase({ id: 'case_old' });
    await seedCase({ id: 'case_shared' });
    await seedCase({ id: 'case_fresh' });
    await seedCase({ id: 'case_private', householdId: 'hh_private' });
    await seedLetter({
      id: 'ltr_seed',
      caseId: 'case_shared',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    const oldPath = await seedLetter({
      id: 'ltr_old',
      source: 'sample',
      trial: 1,
      caseId: 'case_old',
      createdAt: new Date(NOW - DEMO_TRIAL_TTL_MS - 1).toISOString(),
    });
    await seedLetter({
      id: 'ltr_old_shared',
      source: 'sample',
      trial: 1,
      caseId: 'case_shared',
      createdAt: '2026-11-22T00:00:00.000Z',
    });
    const freshPath = await seedLetter({
      id: 'ltr_fresh',
      source: 'sample',
      trial: 1,
      caseId: 'case_fresh',
    });
    const privatePath = await seedLetter({
      id: 'ltr_private_old',
      householdId: 'hh_private',
      source: 'sample',
      trial: 1,
      caseId: 'case_private',
      createdAt: '2026-11-22T00:00:00.000Z',
    });
    seedDecision('ltr_old');
    db.prepare(
      `INSERT INTO checks
        (id, letter_id, household_id, key, label, qtype, answer, outcome)
        VALUES ('chk_old', 'ltr_old', 'hh_demo', 'scam', 'Scam', 'noul', '0.9', 'flagged')`,
    ).run();
    db.prepare(
      `INSERT INTO relations
        (id, household_id, letter_id, other_letter_id, relation, probability, status, created_at)
        VALUES ('rel_old', 'hh_demo', 'ltr_old', 'ltr_seed', 'same_matter', 0.9, 'accepted', ?)`,
    ).run(clock().toISOString());
    db.prepare(
      `INSERT INTO relations
        (id, household_id, letter_id, other_letter_id, relation, probability, status, created_at)
        VALUES ('rel_seed_old', 'hh_demo', 'ltr_seed', 'ltr_old', 'same_matter', 0.9, 'accepted', ?)`,
    ).run(clock().toISOString());
    db.prepare(
      `INSERT INTO asks
        (id, household_id, letter_id, case_id, qtype, question, evidence, options_json, status, created_at)
        VALUES ('ask_old', 'hh_demo', 'ltr_old', 'case_old', 'check', 'Check', 'Evidence', '[]', 'open', ?)`,
    ).run(clock().toISOString());
    for (const [id, relatedId] of [
      ['out_old', 'ltr_old'],
      ['out_ask_old', 'ask_old'],
      ['out_prefix_old', 'ltr_old:notice'],
    ]) {
      db.prepare(
        `INSERT INTO outbox
          (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
          VALUES (?, 'hh_demo', 'parent@example.com', 'parent_note', 'Old', 'Body', ?, 'suppressed', ?)`,
      ).run(id, relatedId, clock().toISOString());
    }
    db.prepare(
      `INSERT INTO case_events
        (id, household_id, case_id, letter_id, type, actor, detail_json, created_at)
        VALUES ('evt_old', 'hh_demo', 'case_old', 'ltr_old', 'opened', 'agent', '{}', ?)`,
    ).run(clock().toISOString());
    db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run('route:ltr_old', '{}');
    db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run('acted:ltr_old', '1');
    db.prepare('UPDATE letters SET box_file_id = ? WHERE id = ?').run('box_old_file', 'ltr_old');

    const { client, request } = mockClient();
    expect(await purgeExpiredTrials(db, client, new Date(NOW))).toBe(3);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith(
      'pinecone',
      'POST',
      '/indexes/mailkeep-letters/vectors/delete',
      { json: { namespace: 'ns_demo', ids: ['ltr_old_shared', 'ltr_old'] } },
    );
    expect(request).toHaveBeenCalledWith(
      'pinecone',
      'POST',
      '/indexes/mailkeep-letters/vectors/delete',
      { json: { namespace: 'ns_private', ids: ['ltr_private_old'] } },
    );

    expect(db.prepare('SELECT id FROM letters ORDER BY id').all()).toEqual([
      { id: 'ltr_fresh' },
      { id: 'ltr_seed' },
    ]);
    expect(db.prepare('SELECT id FROM cases ORDER BY id').all()).toEqual([
      { id: 'case_fresh' },
      { id: 'case_shared' },
    ]);
    for (const table of ['decisions', 'checks', 'relations', 'asks', 'outbox', 'case_events']) {
      expect(
        (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
        table,
      ).toBe(0);
    }
    expect(db.prepare('SELECT k FROM kv').all()).toEqual([{ k: 'schema_version' }]);
    await expect(access(oldPath)).rejects.toThrow();
    await expect(access(privatePath)).rejects.toThrow();
    await expect(access(freshPath)).resolves.toBeUndefined();
  });

  it('supports DB-only cleanup and leaves rows intact when Pinecone fails', async () => {
    await seedLetter({
      id: 'ltr_expired',
      source: 'sample',
      trial: 1,
      createdAt: '2026-11-22T00:00:00.000Z',
    });
    const { client, request } = mockClient();
    request.mockRejectedValueOnce(new Error('Pinecone unavailable'));
    await expect(purgeExpiredTrials(db, client, clock)).rejects.toThrow('Pinecone unavailable');
    expect(db.prepare('SELECT id FROM letters').get()).toEqual({ id: 'ltr_expired' });

    expect(await purgeExpiredTrials(db, undefined, clock)).toBe(1);
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(0);
  });
});
