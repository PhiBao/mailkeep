import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseSchema, householdSchema, letterSchema, todaySchema } from '@mailkeep/shared';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';
import { GatewayClient } from '../src/gateway/client.js';
import { apiRoutes, MAX_UPLOAD_BODY_BYTES } from '../src/http/routes/api.js';
import { momRoutes } from '../src/http/routes/mom.js';
import { issueSession, SESSION_COOKIE, type SessionMember } from '../src/http/session.js';
import { MAX_FILE_BYTES } from '../src/pipeline/intake.js';
import type { PipelineQueue } from '../src/pipeline/queue.js';

const ORIGIN = 'https://mailkeep.test';
const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

let directory: string;
let db: DB;
let app: Hono;
let imageBytes: Buffer;
let enqueue: ReturnType<typeof vi.fn>;
let family: SessionMember;
let parent: SessionMember;
let other: SessionMember;
let familyCookie: string;
let parentCookie: string;
let otherCookie: string;

function clock(): Date {
  return new Date(NOW);
}

function session(member: SessionMember): string {
  const issued = issueSession(db, member.id, clock);
  if (!issued) throw new Error('Could not issue test session');
  return `${SESSION_COOKIE}=${issued.token}`;
}

function csrfHeaders(cookie = familyCookie, origin = ORIGIN): Headers {
  return new Headers({ Cookie: cookie, 'X-Mailkeep': '1', Origin: origin });
}

function jsonPost(pathname: string, body: unknown, cookie = familyCookie): Promise<Response> {
  const requestHeaders = csrfHeaders(cookie);
  requestHeaders.set('Content-Type', 'application/json');
  return app.request(`${ORIGIN}${pathname}`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function upload(form: FormData, cookie = familyCookie): Promise<Response> {
  return app.request(`${ORIGIN}/api/letters`, {
    method: 'POST',
    headers: csrfHeaders(cookie),
    body: form,
  });
}

function storedRoute() {
  return {
    lane: 'headsup',
    kind: 'bill',
    amountCents: 12500,
    dueDate: '2026-11-30',
    relations: [],
    caseChange: null,
    asks: [],
    notes: [],
    checks: [],
    familyAlert: false,
  };
}

async function seedCase(input: {
  id: string;
  householdId?: string;
  title?: string;
  counterparty?: string;
  status?: string;
  dueDate?: string | null;
  amountCents?: number | null;
  secondNotice?: boolean;
  contradiction?: boolean;
  boxFolderId?: string | null;
}): Promise<void> {
  const now = clock().toISOString();
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, amount_cents, due_date,
       second_notice, contradiction, box_folder_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'bill', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.householdId ?? 'hh_a',
    input.title ?? `Case ${input.id}`,
    input.counterparty ?? 'Riverbend Water Utility',
    input.status ?? 'open',
    input.amountCents ?? null,
    input.dueDate ?? null,
    input.secondNotice ? 1 : 0,
    input.contradiction ? 1 : 0,
    input.boxFolderId ?? null,
    now,
    now,
  );
}

async function seedLetter(input: {
  id: string;
  householdId?: string;
  caseId?: string | null;
  title?: string;
  transcript?: string;
  senderOrg?: string;
  receivedAt?: string;
  status?: string;
  lane?: string | null;
  kind?: string | null;
  amountCents?: number | null;
  dueDate?: string | null;
  accountTail?: string | null;
  error?: string | null;
  jevTokens?: number;
  ollamaInTokens?: number;
  ollamaOutTokens?: number;
  costMicrousd?: number;
}): Promise<string> {
  const householdId = input.householdId ?? 'hh_a';
  const memberId = householdId === 'hh_a' ? family.id : other.id;
  const localPath = path.join(directory, `${input.id}.jpg`);
  await writeFile(localPath, imageBytes);
  const now = clock().toISOString();
  db.prepare(
    `INSERT INTO letters
      (id, household_id, source, trial, submitted_by, received_at, status, mime, sha256,
       local_path, transcript, sender_org, title, summary_parent, todo_parent, kind, lane,
       amount_cents, due_date, account_tail, phones_json, scam_rule_hits_json, case_id, error,
       jev_tokens, ollama_in_tokens, ollama_out_tokens, cost_microusd, created_at, updated_at)
     VALUES (?, ?, 'upload', 0, ?, ?, ?, 'image/jpeg', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       '["555-0100"]', '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    householdId,
    memberId,
    input.receivedAt ?? '2026-11-24T10:00:00.000Z',
    input.status ?? 'done',
    `sha_${input.id}`,
    localPath,
    input.transcript ?? `Transcript for ${input.id}`,
    input.senderOrg ?? 'Riverbend Water Utility',
    input.title ?? `Letter ${input.id}`,
    `Summary for ${input.id}`,
    `Todo for ${input.id}`,
    input.kind ?? 'bill',
    input.lane ?? 'headsup',
    input.amountCents ?? null,
    input.dueDate ?? null,
    input.accountTail ?? null,
    input.caseId ?? null,
    input.error ?? null,
    input.jevTokens ?? 0,
    input.ollamaInTokens ?? 0,
    input.ollamaOutTokens ?? 0,
    input.costMicrousd ?? 0,
    now,
    now,
  );
  return localPath;
}

function seedAsk(input: {
  id: string;
  householdId?: string;
  letterId?: string | null;
  caseId?: string | null;
  qtype?: string;
  options?: Array<{ value: string; label: string }>;
  status?: string;
  createdAt?: string;
}): void {
  db.prepare(
    `INSERT INTO asks
      (id, household_id, letter_id, case_id, qtype, question, evidence, options_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'What happened?', 'Evidence', ?, ?, ?)`,
  ).run(
    input.id,
    input.householdId ?? 'hh_a',
    input.letterId ?? null,
    input.caseId ?? null,
    input.qtype ?? 'check',
    JSON.stringify(input.options ?? [{ value: 'handled_it', label: 'Handled it' }]),
    input.status ?? 'open',
    input.createdAt ?? '2026-11-24T10:00:00.000Z',
  );
}

function seedDecision(input: {
  id: string;
  letterId: string;
  householdId?: string;
  past?: Array<Record<string, unknown>>;
  answers?: Record<string, unknown>;
}): void {
  db.prepare(
    `INSERT INTO decisions
      (id, letter_id, household_id, model_id, request_json, response_json, latency_ms, created_at)
     VALUES (?, ?, ?, 'jev-test', ?, ?, 123, ?)`,
  ).run(
    input.id,
    input.letterId,
    input.householdId ?? 'hh_a',
    JSON.stringify({
      state: {
        today: '2026-11-24',
        past: input.past ?? [],
        amount_candidates: [],
        date_candidates: [],
      },
      questions: { same_matter_0: {}, same_matter_1: {} },
    }),
    JSON.stringify({
      model: 'jev-test',
      answers: input.answers ?? {},
      usage: { input_tokens: 42, output_tokens: 5 },
    }),
    '2026-11-24T10:30:00.000Z',
  );
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-api-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  imageBytes = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));

  for (const householdId of ['hh_a', 'hh_b']) {
    createHousehold(db, {
      id: householdId,
      name: householdId === 'hh_a' ? 'Rivera' : 'Other',
      parentDisplay: 'Ruth',
      timezone: 'America/Chicago',
      demo: false,
    });
  }
  addMember(db, {
    householdId: 'hh_a',
    email: 'family@example.com',
    displayName: 'Sarah',
    role: 'family',
  });
  addMember(db, {
    householdId: 'hh_a',
    email: 'parent@example.com',
    displayName: 'Ruth',
    role: 'parent',
  });
  addMember(db, {
    householdId: 'hh_b',
    email: 'other@example.com',
    displayName: 'Other',
    role: 'family',
  });
  family = db
    .prepare("SELECT * FROM members WHERE email = 'family@example.com'")
    .get() as unknown as SessionMember;
  parent = db
    .prepare("SELECT * FROM members WHERE email = 'parent@example.com'")
    .get() as unknown as SessionMember;
  other = db
    .prepare("SELECT * FROM members WHERE email = 'other@example.com'")
    .get() as unknown as SessionMember;
  family = db.prepare('SELECT * FROM members WHERE id = ?').get(family.id) as SessionMember;
  parent = db.prepare('SELECT * FROM members WHERE id = ?').get(parent.id) as SessionMember;
  other = db.prepare('SELECT * FROM members WHERE id = ?').get(other.id) as SessionMember;
  familyCookie = session(family);
  parentCookie = session(parent);
  otherCookie = session(other);

  enqueue = vi.fn().mockResolvedValue(undefined);
  const config = loadConfig({ MAILKEEP_PUBLIC_URL: ORIGIN, MAILKEEP_DATA_DIR: directory });
  const queue = { enqueue } as unknown as Pick<PipelineQueue, 'enqueue'>;
  app = new Hono();
  app.route(
    '/',
    apiRoutes({ config, db, client: new GatewayClient({ config }), queue, now: clock }),
  );
  app.route('/', momRoutes({ db, now: clock }));

  await seedCase({
    id: 'case_a',
    title: 'Water bill',
    dueDate: '2026-11-30',
    amountCents: 12500,
    boxFolderId: 'folder_a',
  });
  await seedCase({ id: 'case_past', title: 'Earlier bill', dueDate: '2026-12-05' });
  await seedCase({
    id: 'case_b',
    householdId: 'hh_b',
    title: 'Other bill',
    dueDate: '2026-11-28',
  });
  await seedCase({
    id: 'case_b_paid',
    householdId: 'hh_b',
    title: 'Other paid bill',
    status: 'paid',
    dueDate: '2026-11-20',
  });

  await seedLetter({
    id: 'ltr_past',
    caseId: 'case_past',
    title: 'Earlier water bill',
    transcript: 'Earlier household A transcript',
    receivedAt: '2026-11-23T12:00:00.000Z',
    lane: 'handled',
    accountTail: '1234',
  });
  await seedLetter({
    id: 'ltr_a',
    caseId: 'case_a',
    title: 'Water bill',
    transcript: 'HOUSEHOLD A TRANSCRIPT',
    receivedAt: '2026-11-23T18:00:00.000Z',
    amountCents: 12500,
    dueDate: '2026-11-30',
    accountTail: '1234',
    jevTokens: 42,
    ollamaInTokens: 100,
    ollamaOutTokens: 20,
    costMicrousd: 7,
  });
  await seedLetter({
    id: 'ltr_b',
    householdId: 'hh_b',
    caseId: 'case_b',
    title: 'Other letter',
    transcript: 'HOUSEHOLD B SECRET TRANSCRIPT',
    senderOrg: 'Other Utility',
    accountTail: '9999',
  });
  await seedLetter({
    id: 'ltr_b_failed',
    householdId: 'hh_b',
    caseId: 'case_b',
    title: 'Other failed letter',
    transcript: 'HOUSEHOLD B FAILED SECRET',
    status: 'failed',
    error: 'other failure',
    receivedAt: '2026-11-10T12:00:00.000Z',
  });

  seedDecision({
    id: 'dec_a',
    letterId: 'ltr_a',
    past: [
      {
        id: 'ltr_past',
        received: '2026-11-23',
        sender: 'Riverbend Water Utility',
        kind: 'bill',
        lane: 'handled',
      },
      {
        id: 'ltr_b',
        received: '2026-11-24',
        sender: 'Other Utility',
        kind: 'bill',
        lane: 'headsup',
      },
    ],
    answers: {
      same_matter_0: { type: 'noul', noul: 0.91 },
      same_matter_1: { type: 'noul', noul: 0.99 },
    },
  });
  seedDecision({ id: 'dec_b', letterId: 'ltr_b', householdId: 'hh_b' });

  db.prepare(
    `INSERT INTO checks
      (id, letter_id, household_id, key, label, qtype, answer, probability, confidence,
       threshold, outcome)
     VALUES ('chk_a', 'ltr_a', 'hh_a', 'same_matter_0', 'Same matter', 'noul', '0.91',
       0.91, 0.8, 0.85, 'linked')`,
  ).run();
  db.prepare(
    `INSERT INTO relations
      (id, household_id, letter_id, other_letter_id, relation, probability, recall_score,
       status, created_at)
     VALUES ('rel_a', 'hh_a', 'ltr_a', 'ltr_past', 'same_matter', 0.91, 0.88, 'accepted', ?)`,
  ).run('2026-11-23T19:00:00.000Z');
  db.prepare(
    `INSERT INTO case_events
      (id, household_id, case_id, letter_id, type, actor, member_id, detail_json, created_at)
     VALUES ('evt_a', 'hh_a', 'case_a', 'ltr_a', 'opened', 'agent', NULL, ?, ?)`,
  ).run(JSON.stringify({ lane: 'headsup' }), '2026-11-23T19:00:00.000Z');
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
     VALUES ('out_a', 'hh_a', 'parent@example.com', 'parent_note', 'Water bill', 'Body',
       'ltr_a', 'sent', ?)`,
  ).run('2026-11-23T20:00:00.000Z');

  seedAsk({
    id: 'ask_new',
    letterId: 'ltr_a',
    caseId: 'case_a',
    createdAt: '2026-11-24T10:00:00.000Z',
  });
  seedAsk({
    id: 'ask_old',
    letterId: 'ltr_past',
    caseId: 'case_past',
    createdAt: '2026-11-22T10:00:00.000Z',
  });
  seedAsk({
    id: 'ask_b',
    householdId: 'hh_b',
    letterId: 'ltr_b',
    caseId: 'case_b',
  });
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
     VALUES ('out_ask', 'hh_a', 'family@example.com', 'ask', 'Question', 'Body',
       'ask_new', 'pending', ?)`,
  ).run('2026-11-24T10:01:00.000Z');
  db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run(
    'route:ltr_a',
    JSON.stringify(storedRoute()),
  );
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('API authentication and scoping', () => {
  it('requires a session on every route', async () => {
    const routes: Array<{ method: string; path: string; body?: BodyInit }> = [
      { method: 'GET', path: '/api/me' },
      { method: 'GET', path: '/api/today' },
      { method: 'GET', path: '/api/mom' },
      { method: 'GET', path: '/api/cases/case_a' },
      { method: 'GET', path: '/api/letters/ltr_a' },
      { method: 'GET', path: '/api/letters/ltr_a/image' },
      { method: 'GET', path: '/api/letters/ltr_a/decision' },
      { method: 'POST', path: '/api/letters', body: new FormData() },
      { method: 'POST', path: '/api/letters/ltr_a/retry' },
      {
        method: 'POST',
        path: '/api/asks/ask_new/answer',
        body: JSON.stringify({ answer: 'handled_it' }),
      },
      { method: 'POST', path: '/api/cases/case_a/mark-paid' },
      { method: 'POST', path: '/api/cases/case_a/reopen' },
    ];
    for (const route of routes) {
      const response = await app.request(`${ORIGIN}${route.path}`, {
        method: route.method,
        body: route.body,
      });
      expect(response.status, `${route.method} ${route.path}`).toBe(401);
    }
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('gives parents the read-only Mom alias and the same validated TodayDTO', async () => {
    const familyToday = await app.request(`${ORIGIN}/api/today`, {
      headers: { Cookie: familyCookie },
    });
    const parentToday = await app.request(`${ORIGIN}/api/mom`, {
      headers: { Cookie: parentCookie },
    });
    expect(familyToday.status).toBe(200);
    expect(parentToday.status).toBe(200);
    const familyBody = todaySchema.parse(await familyToday.json());
    const parentBody = todaySchema.parse(await parentToday.json());
    expect(parentBody).toEqual(familyBody);
    expect(parentToday.headers.get('Cache-Control')).toBe('no-store');
    expect(
      (await app.request(`${ORIGIN}/api/today`, { headers: { Cookie: parentCookie } })).status,
    ).toBe(403);

    const me = await app.request(`${ORIGIN}/api/me`, { headers: { Cookie: parentCookie } });
    expect(householdSchema.parse(await me.json())).toMatchObject({
      id: 'hh_a',
      name: 'Rivera',
      parentDisplay: 'Ruth',
      timezone: 'America/Chicago',
      today: '2026-11-24',
    });
  });

  it('returns 404 for every other-household resource without leaking its contents', async () => {
    const reads = [
      '/api/cases/case_b',
      '/api/letters/ltr_b',
      '/api/letters/ltr_b/image',
      '/api/letters/ltr_b/decision',
    ];
    for (const pathname of reads) {
      const response = await app.request(`${ORIGIN}${pathname}`, {
        headers: { Cookie: familyCookie },
      });
      expect(response.status, pathname).toBe(404);
      expect(await response.text()).not.toContain('HOUSEHOLD B');
    }

    const mutations: Array<[string, unknown | null]> = [
      ['/api/letters/ltr_b_failed/retry', null],
      ['/api/asks/ask_b/answer', { answer: 'handled_it' }],
      ['/api/cases/case_b/mark-paid', null],
      ['/api/cases/case_b_paid/reopen', null],
    ];
    for (const [pathname, body] of mutations) {
      const requestHeaders = csrfHeaders();
      requestHeaders.set('Content-Type', 'application/json');
      const response = await app.request(`${ORIGIN}${pathname}`, {
        method: 'POST',
        headers: requestHeaders,
        body: body === null ? undefined : JSON.stringify(body),
      });
      expect(response.status, pathname).toBe(404);
      expect(await response.text()).not.toContain('HOUSEHOLD B');
    }
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get('case_b') as { status: string })
        .status,
    ).toBe('open');
    expect(
      (db.prepare('SELECT status FROM asks WHERE id = ?').get('ask_b') as { status: string })
        .status,
    ).toBe('open');

    const ownLetter = await app.request(`${ORIGIN}/api/letters/ltr_b`, {
      headers: { Cookie: otherCookie },
    });
    expect(ownLetter.status).toBe(200);
    const ownDto = letterSchema.parse(await ownLetter.json());
    expect(ownDto.householdId).toBe('hh_b');
    expect(ownDto.transcript).toBe('HOUSEHOLD B SECRET TRANSCRIPT');
    expect(
      (await app.request(`${ORIGIN}/api/letters/ltr_a`, { headers: { Cookie: otherCookie } }))
        .status,
    ).toBe(404);
  });

  it('requires CSRF on every POST before changing state', async () => {
    await seedLetter({ id: 'ltr_failed', status: 'failed', error: 'try again' });
    const form = new FormData();
    form.append('files', new Blob([imageBytes], { type: 'image/jpeg' }), 'letter.jpg');
    const posts: Array<[string, BodyInit | undefined, string]> = [
      ['/api/letters', form, 'multipart/form-data'],
      ['/api/letters/ltr_failed/retry', undefined, 'application/json'],
      ['/api/asks/ask_new/answer', JSON.stringify({ answer: 'handled_it' }), 'application/json'],
      ['/api/cases/case_a/mark-paid', undefined, 'application/json'],
      ['/api/cases/case_past/reopen', undefined, 'application/json'],
    ];
    for (const [pathname, body, contentType] of posts) {
      const requestHeaders = new Headers({ Cookie: familyCookie });
      if (contentType === 'application/json') requestHeaders.set('Content-Type', contentType);
      const response = await app.request(`${ORIGIN}${pathname}`, {
        method: 'POST',
        headers: requestHeaders,
        body,
      });
      expect(response.status, pathname).toBe(403);
      expect(await response.json()).toEqual({ error: 'csrf' });
    }
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      (
        db.prepare('SELECT status FROM letters WHERE id = ?').get('ltr_failed') as {
          status: string;
        }
      ).status,
    ).toBe('failed');
    expect(
      (db.prepare('SELECT status FROM asks WHERE id = ?').get('ask_new') as { status: string })
        .status,
    ).toBe('open');
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get('case_a') as { status: string })
        .status,
    ).toBe('open');

    const crossOriginHeaders = csrfHeaders(familyCookie, 'https://attacker.example');
    crossOriginHeaders.set('Content-Type', 'application/json');
    const crossOrigin = await app.request(`${ORIGIN}/api/asks/ask_new/answer`, {
      method: 'POST',
      headers: crossOriginHeaders,
      body: JSON.stringify({ answer: 'handled_it' }),
    });
    expect(crossOrigin.status).toBe(403);
  });
});

describe('Today, case, and letter DTOs', () => {
  it('builds TodayDTO from scoped rows with the required ordering and limits', async () => {
    const dueDates = [
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
    ];
    for (const [index, dueDate] of dueDates.entries()) {
      await seedCase({
        id: `case_due_${index}`,
        title: `Due ${index}`,
        status: index % 2 === 0 ? 'open' : 'overdue',
        dueDate,
      });
    }
    await seedCase({
      id: 'case_paid',
      status: 'paid',
      dueDate: '2026-11-20',
    });
    await seedCase({
      id: 'case_closed',
      status: 'closed',
      dueDate: '2026-11-21',
    });
    await seedLetter({
      id: 'ltr_handled_now',
      lane: 'handled',
      receivedAt: '2026-11-24T11:00:00.000Z',
    });
    await seedLetter({
      id: 'ltr_handled_old',
      lane: 'handled',
      receivedAt: '2026-11-22T11:00:00.000Z',
    });

    const response = await app.request(`${ORIGIN}/api/today`, {
      headers: { Cookie: familyCookie },
    });
    const today = todaySchema.parse(await response.json());
    expect(today.household.today).toBe('2026-11-24');
    expect(today.asks.map((ask) => ask.id)).toEqual(['ask_new', 'ask_old']);
    expect(today.asks.every((ask) => ask.status === 'open')).toBe(true);
    expect(today.upcoming.length).toBeGreaterThan(8);
    expect(today.upcoming.slice(0, 8).map((item) => item.dueDate)).toEqual([
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-11-30',
      '2026-12-01',
    ]);
    expect(today.upcoming.slice(0, 8).map((item) => item.daysLeft)).toEqual([
      1, 2, 3, 4, 5, 6, 6, 7,
    ]);
    expect(today.handledThisWeek.count).toBe(2);
    expect(today.handledThisWeek.items.map((item) => item.id)).toEqual([
      'ltr_handled_now',
      'ltr_past',
    ]);
    expect(today.recent[0]?.id).toBe('ltr_handled_now');
    expect(today.recent.length).toBeLessThanOrEqual(8);
    expect(today.recent.every((item) => !('householdId' in item))).toBe(true);
    expect(JSON.stringify(today)).not.toContain('HOUSEHOLD B SECRET');
    expect(JSON.stringify(today)).not.toContain(directory);
  });

  it('keeps CAREFUL and undated second notices in attention and hides paid-case asks', async () => {
    await seedCase({ id: 'case_watch', status: 'watch', dueDate: null });
    await seedCase({
      id: 'case_second_no_due',
      status: 'open',
      dueDate: null,
      secondNotice: true,
    });
    await seedCase({ id: 'case_paid_attention', status: 'paid', dueDate: '2026-11-20' });
    seedAsk({ id: 'ask_paid_case', caseId: 'case_paid_attention' });
    const response = await app.request(`${ORIGIN}/api/today`, {
      headers: { Cookie: familyCookie },
    });
    const today = todaySchema.parse(await response.json());
    expect(today.upcoming).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caseId: 'case_watch', status: 'watch', daysLeft: 0 }),
        expect.objectContaining({
          caseId: 'case_second_no_due',
          secondNotice: true,
          daysLeft: 0,
        }),
      ]),
    );
    expect(today.upcoming.some((item) => item.caseId === 'case_paid_attention')).toBe(false);
    expect(today.asks.some((ask) => ask.id === 'ask_paid_case')).toBe(false);
  });

  it('builds CaseDTO with letters, events, and relations', async () => {
    const response = await app.request(`${ORIGIN}/api/cases/case_a`, {
      headers: { Cookie: familyCookie },
    });
    const dto = caseSchema.parse(await response.json());
    expect(dto).toMatchObject({
      id: 'case_a',
      householdId: 'hh_a',
      title: 'Water bill',
      status: 'open',
      amountCents: 12500,
      dueDate: '2026-11-30',
      secondNotice: false,
      contradiction: false,
      boxFolderUrl: 'https://app.box.com/folder/folder_a',
    });
    expect(dto.letters.map((letter) => letter.id)).toEqual(['ltr_a']);
    expect(dto.events).toEqual([
      expect.objectContaining({
        id: 'evt_a',
        type: 'opened',
        actor: 'agent',
        detail: { lane: 'headsup' },
      }),
    ]);
    expect(dto.relations).toEqual([
      expect.objectContaining({
        id: 'rel_a',
        letterId: 'ltr_a',
        otherLetterId: 'ltr_past',
        relation: 'same_matter',
        recallScore: 0.88,
      }),
    ]);
  });

  it('builds the complete LetterDTO and keeps recall and outbox household-scoped', async () => {
    const response = await app.request(`${ORIGIN}/api/letters/ltr_a`, {
      headers: { Cookie: familyCookie },
    });
    const text = await response.text();
    const dto = letterSchema.parse(JSON.parse(text));
    expect(dto).toMatchObject({
      id: 'ltr_a',
      householdId: 'hh_a',
      source: 'upload',
      trial: false,
      submittedBy: family.id,
      title: 'Water bill',
      transcript: 'HOUSEHOLD A TRANSCRIPT',
      kind: 'bill',
      lane: 'headsup',
      amountCents: 12500,
      dueDate: '2026-11-30',
      accountTail: '1234',
      phones: ['555-0100'],
      scamRuleHits: [],
      caseId: 'case_a',
      imageUrl: '/api/letters/ltr_a/image',
    });
    expect(dto.checks).toEqual([
      expect.objectContaining({ id: 'chk_a', key: 'same_matter_0', probability: 0.91 }),
    ]);
    expect(dto.relations).toHaveLength(1);
    expect(dto.recall).toEqual([
      {
        letterId: 'ltr_past',
        title: 'Earlier water bill',
        senderOrg: 'Riverbend Water Utility',
        receivedAt: '2026-11-23T12:00:00.000Z',
        kind: 'bill',
        lane: 'handled',
        recallScore: 0.88,
        tailMatch: true,
        sameMatterProbability: 0.91,
      },
    ]);
    expect(dto.outbox.map((item) => item.id).sort()).toEqual(['out_a', 'out_ask']);
    expect(dto.outbox.find((item) => item.id === 'out_a')?.bodyText).toBe('Body');
    expect(dto.decision).toEqual({
      modelId: 'jev-test',
      latencyMs: 123,
      createdAt: '2026-11-24T10:30:00.000Z',
      questionCount: 2,
      jevTokens: 42,
      ollamaInTokens: 100,
      ollamaOutTokens: 20,
      costMicrousd: 7,
      rawResponseUrl: '/api/letters/ltr_a/decision',
    });
    expect(dto).not.toHaveProperty('local_path');
    expect(text).not.toContain(directory);
    expect(text).not.toContain('HOUSEHOLD B SECRET');
  });

  it('exposes route notes and human-readable indexed check answers', async () => {
    db.prepare("UPDATE decisions SET request_json = ? WHERE id = 'dec_a'").run(
      JSON.stringify({
        state: {
          today: '2026-11-24',
          past: [{ id: 'ltr_past' }],
          amount_candidates: [{ id: 'a0', text: '$84.17', context: 'Amount due' }],
          date_candidates: [{ id: 'd0', text: 'November 20, 2026', context: 'Payment due' }],
        },
        questions: {},
      }),
    );
    db.prepare(
      `INSERT INTO checks
        (id, letter_id, household_id, key, label, qtype, answer, probability, confidence,
         threshold, outcome)
       VALUES ('chk_amount', 'ltr_a', 'hh_a', 'amount_due', 'Amount due', 'choice', 'a0',
         0.67, 0.59, 0.7, 'do not use')`,
    ).run();
    db.prepare(
      `INSERT INTO checks
        (id, letter_id, household_id, key, label, qtype, answer, probability, confidence,
         threshold, outcome)
       VALUES ('chk_due', 'ltr_a', 'hh_a', 'due_date', 'Due date', 'choice', 'd0',
         1, 1, 0.7, 'use field')`,
    ).run();
    db.prepare(
      'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
    ).run('route:ltr_a', JSON.stringify({ notes: ['Second notice for this bill.'] }));
    const response = await app.request(`${ORIGIN}/api/letters/ltr_a`, {
      headers: { Cookie: familyCookie },
    });
    const dto = letterSchema.parse(await response.json());
    expect(dto.notes).toEqual(['Second notice for this bill.']);
    expect(dto.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'same_matter_0',
          label: 'Earlier water bill · Same matter',
        }),
        expect.objectContaining({ key: 'amount_due', answer: '$84.17' }),
        expect.objectContaining({ key: 'due_date', answer: 'November 20, 2026' }),
      ]),
    );
  });

  it('serves the latest raw decision JSON from an authenticated same-origin route', async () => {
    const response = await app.request(`${ORIGIN}/api/letters/ltr_a/decision`, {
      headers: { Cookie: familyCookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      model: 'jev-test',
      answers: {
        same_matter_0: { type: 'noul', noul: 0.91 },
        same_matter_1: { type: 'noul', noul: 0.99 },
      },
      usage: { input_tokens: 42, output_tokens: 5 },
    });
  });

  it('serves the normalized original with private one-hour caching', async () => {
    const response = await app.request(`${ORIGIN}/api/letters/ltr_a/image`, {
      headers: { Cookie: familyCookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(imageBytes);
  });
});

describe('multipart upload and retry', () => {
  it('accepts files through intake, returns LetterDTOs, and enqueys only new letters', async () => {
    const variant = Buffer.concat([imageBytes, Buffer.from('variant')]);
    const form = new FormData();
    form.append('files', new Blob([imageBytes], { type: 'image/jpeg' }), 'one.jpg');
    form.append('files', new Blob([variant], { type: 'image/jpeg' }), 'two.jpg');
    const response = await upload(form);
    expect(response.status).toBe(202);
    const text = await response.text();
    const letters = letterSchema.array().parse(JSON.parse(text));
    expect(letters).toHaveLength(2);
    expect(letters.every((letter) => letter.source === 'upload')).toBe(true);
    expect(letters.every((letter) => letter.submittedBy === family.id)).toBe(true);
    expect(letters.every((letter) => letter.status === 'queued')).toBe(true);
    expect(letters.every((letter) => letter.transcript === '')).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(6);
    expect(text).not.toContain('local_path');
    expect(text).not.toContain(directory);

    const duplicate = await upload(form);
    expect(duplicate.status).toBe(202);
    const duplicates = letterSchema.array().parse(await duplicate.json());
    expect(duplicates.map((letter) => letter.id).sort()).toEqual(
      letters.map((letter) => letter.id).sort(),
    );
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(6);
  });

  it('rejects unsupported files without writing a row or queueing', async () => {
    const form = new FormData();
    form.append('files', new Blob(['not an image'], { type: 'text/plain' }), 'letter.txt');
    const response = await upload(form);
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'unsupported' });
    expect(enqueue).not.toHaveBeenCalled();
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(4);
  });

  it('enforces the 15 MiB per-file limit', async () => {
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1, 0xff);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const form = new FormData();
    form.append('files', new Blob([bytes], { type: 'image/jpeg' }), 'large.jpg');
    const response = await upload(form);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'too_large' });
    expect(enqueue).not.toHaveBeenCalled();
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(4);
  });

  it('enforces the ten-file limit before intake', async () => {
    const form = new FormData();
    const signature = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    for (let index = 0; index < 11; index += 1) {
      form.append('files', new Blob([signature], { type: 'image/jpeg' }), `${index}.jpg`);
    }
    const response = await upload(form);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'too_many_files' });
    expect(enqueue).not.toHaveBeenCalled();
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(4);
  });

  it('caps streamed multipart bodies at 60 MiB even without Content-Length', async () => {
    const chunk = new Uint8Array(MAX_UPLOAD_BODY_BYTES + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const requestHeaders = csrfHeaders();
    requestHeaders.set('Content-Type', 'multipart/form-data; boundary=test');
    const init = {
      method: 'POST',
      headers: requestHeaders,
      body,
      duplex: 'half',
    } as RequestInit;
    const response = await app.request(`${ORIGIN}/api/letters`, init);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'too_large' });
    expect(enqueue).not.toHaveBeenCalled();
    expect((db.prepare('SELECT count(*) AS n FROM letters').get() as { n: number }).n).toBe(4);
  });

  it('retries a failed family letter by resetting it and injecting the queue', async () => {
    await seedLetter({ id: 'ltr_failed', status: 'failed', error: 'provider unavailable' });
    const response = await jsonPost('/api/letters/ltr_failed/retry', null);
    expect(response.status).toBe(202);
    const dto = letterSchema.parse(await response.json());
    expect(dto.status).toBe('queued');
    expect(dto.error).toBeNull();
    expect(enqueue).toHaveBeenCalledWith('ltr_failed');
    expect(db.prepare('SELECT status, error FROM letters WHERE id = ?').get('ltr_failed')).toEqual({
      status: 'queued',
      error: null,
    });

    const notRetryable = await jsonPost('/api/letters/ltr_a/retry', null);
    expect(notRetryable.status).toBe(409);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const parentRetry = await jsonPost('/api/letters/ltr_failed/retry', null, parentCookie);
    expect(parentRetry.status).toBe(403);
  });
});

describe('ask answers and case actions', () => {
  it('applies a paid answer through T18 via web and returns the updated LetterDTO', async () => {
    seedAsk({
      id: 'ask_paid',
      letterId: 'ltr_a',
      caseId: 'case_a',
      qtype: 'paid',
      options: [
        { value: 'paid', label: 'Paid' },
        { value: 'not_paid', label: 'Not paid' },
      ],
    });
    const response = await jsonPost('/api/asks/ask_paid/answer', { answer: ' paid ' });
    expect(response.status).toBe(200);
    const dto = letterSchema.parse(await response.json());
    expect(dto.lane).toBe('handled');
    expect(dto.amountCents).toBeNull();
    expect(dto.caseId).toBe('case_a');
    expect(db.prepare('SELECT status FROM cases WHERE id = ?').get('case_a')).toEqual({
      status: 'paid',
    });
    expect(db.prepare("SELECT v FROM kv WHERE k = 'case-sync:hh_a:case_a'").get()).toBeDefined();
    expect(
      db
        .prepare('SELECT status, answer_key, answered_by, answered_via FROM asks WHERE id = ?')
        .get('ask_paid'),
    ).toEqual({
      status: 'answered',
      answer_key: 'paid',
      answered_by: family.id,
      answered_via: 'web',
    });
    const events = db
      .prepare("SELECT type, actor, member_id FROM case_events WHERE case_id = 'case_a'")
      .all() as Array<{ type: string; actor: string; member_id: string | null }>;
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'marked_paid', actor: 'member', member_id: family.id }),
        expect.objectContaining({ type: 'answered', actor: 'member', member_id: family.id }),
      ]),
    );

    const repeated = await jsonPost('/api/asks/ask_paid/answer', { answer: 'paid' });
    expect(repeated.status).toBe(409);
  });

  it('queues the same scam warning for a web answer as for email', async () => {
    seedAsk({
      id: 'ask_scam',
      letterId: 'ltr_a',
      caseId: 'case_a',
      qtype: 'scam',
      options: [
        { value: 'scam', label: 'Scam' },
        { value: 'real', label: 'Real' },
      ],
    });
    const response = await jsonPost('/api/asks/ask_scam/answer', { answer: 'scam' });
    expect(response.status).toBe(200);
    expect(letterSchema.parse(await response.json()).lane).toBe('careful');
    expect(
      db.prepare("SELECT count(*) AS n FROM outbox WHERE related_id = 'ltr_a:answer-scam'").get(),
    ).toEqual({ n: 2 });
  });

  it('rejects invalid answers and parent mutations without changing the ask', async () => {
    const invalid = await jsonPost('/api/asks/ask_new/answer', { answer: 'not-offered' });
    expect(invalid.status).toBe(400);
    const parentAnswer = await jsonPost(
      '/api/asks/ask_new/answer',
      { answer: 'handled_it' },
      parentCookie,
    );
    expect(parentAnswer.status).toBe(403);
    expect(db.prepare('SELECT status FROM asks WHERE id = ?').get('ask_new')).toEqual({
      status: 'open',
    });
  });

  it('marks a case paid and reopens it through the state machine', async () => {
    const paid = await jsonPost('/api/cases/case_a/mark-paid', null);
    expect(paid.status).toBe(200);
    expect(caseSchema.parse(await paid.json()).status).toBe('paid');
    expect(db.prepare('SELECT lane FROM letters WHERE id = ?').get('ltr_a')).toEqual({
      lane: 'handled',
    });
    expect(db.prepare("SELECT v FROM kv WHERE k = 'case-sync:hh_a:case_a'").get()).toBeDefined();
    expect(db.prepare('SELECT status FROM asks WHERE id = ?').get('ask_new')).toEqual({
      status: 'answered',
    });
    expect(
      db
        .prepare(
          "SELECT type, actor, member_id, detail_json FROM case_events WHERE case_id = 'case_a' AND type = 'marked_paid'",
        )
        .get(),
    ).toEqual({
      type: 'marked_paid',
      actor: 'member',
      member_id: family.id,
      detail_json: JSON.stringify({ via: 'web' }),
    });

    const reopened = await jsonPost('/api/cases/case_a/reopen', null);
    expect(reopened.status).toBe(200);
    expect(caseSchema.parse(await reopened.json()).status).toBe('open');
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM case_events WHERE case_id = 'case_a' AND type = 'reopened'",
        )
        .get(),
    ).toEqual({ n: 1 });

    const invalid = await jsonPost('/api/cases/case_a/reopen', null);
    expect(invalid.status).toBe(409);
    const parentAction = await jsonPost('/api/cases/case_a/mark-paid', null, parentCookie);
    expect(parentAction.status).toBe(403);
  });
});
