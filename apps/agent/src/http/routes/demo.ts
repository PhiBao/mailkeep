import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CaseDTO,
  caseSchema,
  type LetterDTO,
  letterSchema,
  type TodayDTO,
  todaySchema,
} from '@mailkeep/shared';
import { type Context, Hono } from 'hono';
import { forget } from '../../act/memory.js';
import type { Config } from '../../config.js';
import type { DB } from '../../db/db.js';
import type { GatewayClient } from '../../gateway/client.js';
import {
  IntakeError,
  type IntakeInput,
  type IntakeResult,
  intakeFile,
} from '../../pipeline/intake.js';
import type { PipelineQueue } from '../../pipeline/queue.js';
import { now as householdNow, todayIso } from '../../util/clock.js';
import { log } from '../../util/log.js';
import { clientIp, SlidingWindowRateLimiter } from '../ratelimit.js';
import type { Clock } from '../session.js';
import { buildCaseDTO, buildLetterDTO, buildTodayDTO } from './api.js';

const HOUR_MS = 60 * 60_000;
export const DEMO_TRIAL_TTL_MS = 24 * HOUR_MS;
export const DEMO_TODAY = '2026-12-09';
const DAY_MS = 86_400_000;
const SAMPLE_IP_RATE = 5;
const SAMPLE_GLOBAL_RATE = 30;
const TESTSET_OUT_DIR = fileURLToPath(new URL('../../../../../testset/out/', import.meta.url));

export const DEMO_SAMPLE_IDS = ['L02', 'L09', 'L11', 'L05', 'L26', 'L28'] as const;
export type DemoSampleId = (typeof DEMO_SAMPLE_IDS)[number];

export interface SampleDTO {
  id: DemoSampleId;
  title: string;
  description: string;
  photo: 'normal';
  imageUrl: string;
}

const SAMPLE_COPY: Record<DemoSampleId, { title: string; description: string }> = {
  L02: {
    title: 'Riverbend PAST DUE',
    description: 'A second notice that links to the Nov 18 bill.',
  },
  L09: {
    title: 'Urgent benefits notice',
    description: 'A health-plan lookalike asks for a call to keep benefits active.',
  },
  L11: {
    title: 'Lakeshore policy renewal',
    description: 'Policy documents link back to the earlier renewal notice.',
  },
  L05: {
    title: 'Payment confirmation',
    description: 'A payment confirmation closes an earlier government bill.',
  },
  L26: {
    title: 'Voter reminder',
    description: 'A third-party vote-by-mail reminder asks for no payment.',
  },
  L28: {
    title: 'Personal letter',
    description: 'A handwritten note is kept without creating a task.',
  },
};

type LetterRow = Parameters<typeof buildLetterDTO>[1] & {
  sha256: string;
  created_at: string;
};
type CaseRow = Parameters<typeof buildCaseDTO>[1];
type DemoCaseBaseline = Array<Record<string, unknown>>;
type DemoFileReader = (filePath: string) => Promise<Buffer>;
type DemoIntake = (input: IntakeInput) => Promise<IntakeResult>;

export interface DemoDeps {
  config: Config;
  db: DB;
  queue: Pick<PipelineQueue, 'enqueue'>;
  now?: Clock | undefined;
  readFile?: DemoFileReader | undefined;
  intake?: DemoIntake | undefined;
}

function isSampleId(value: string): value is DemoSampleId {
  return (DEMO_SAMPLE_IDS as readonly string[]).includes(value);
}

function sampleDTO(id: DemoSampleId): SampleDTO {
  return {
    id,
    ...SAMPLE_COPY[id],
    photo: 'normal',
    imageUrl: `/api/demo/samples/${encodeURIComponent(id)}/image`,
  };
}

function samplePath(id: DemoSampleId): string {
  return path.join(TESTSET_OUT_DIR, `${id}.jpg`);
}

function demoHousehold(
  db: DB,
  config: Config,
  realNow = new Date(),
): { id: string; clock_offset_days: number; timezone: string } | undefined {
  const household = db
    .prepare('SELECT id, clock_offset_days, timezone FROM households WHERE id = ? AND is_demo = 1')
    .get(config.MAILKEEP_DEMO_HOUSEHOLD_ID) as
    | { id: string; clock_offset_days: number; timezone: string }
    | undefined;
  if (!household) return undefined;
  const realToday = todayIso({ clock_offset_days: 0, timezone: household.timezone }, realNow);
  const offset = Math.round(
    (Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse(`${realToday}T00:00:00Z`)) / DAY_MS,
  );
  if (offset !== household.clock_offset_days) {
    db.prepare('UPDATE households SET clock_offset_days = ? WHERE id = ?').run(
      offset,
      household.id,
    );
  }
  return { ...household, clock_offset_days: offset };
}

function demoLetter(db: DB, householdId: string, letterId: string): LetterRow | undefined {
  return db
    .prepare('SELECT * FROM letters WHERE id = ? AND household_id = ?')
    .get(letterId, householdId) as LetterRow | undefined;
}

function demoCase(db: DB, householdId: string, caseId: string): CaseRow | undefined {
  return db
    .prepare('SELECT * FROM cases WHERE id = ? AND household_id = ?')
    .get(caseId, householdId) as CaseRow | undefined;
}

function caseBaselineKey(householdId: string): string {
  return `demo:case-baseline:${householdId}`;
}

function ensureCaseBaseline(db: DB, householdId: string): void {
  const key = caseBaselineKey(householdId);
  if (db.prepare('SELECT v FROM kv WHERE k = ?').get(key)) return;
  const rows = db
    .prepare('SELECT * FROM cases WHERE household_id = ? ORDER BY id')
    .all(householdId) as DemoCaseBaseline;
  db.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?, ?)').run(key, JSON.stringify(rows));
}

function restoreCaseBaseline(db: DB, householdId: string): void {
  const key = caseBaselineKey(householdId);
  const stored = db.prepare('SELECT v FROM kv WHERE k = ?').get(key) as { v: string } | undefined;
  if (!stored) return;
  const rows = JSON.parse(stored.v) as DemoCaseBaseline;
  db.prepare('DELETE FROM cases WHERE household_id = ?').run(householdId);
  const insert = db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, account_tail, kind, status, amount_cents, due_date,
       second_notice, contradiction, box_folder_id, box_casefile_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(
      row.id,
      row.household_id,
      row.title,
      row.counterparty,
      row.account_tail,
      row.kind,
      row.status,
      row.amount_cents,
      row.due_date,
      row.second_notice,
      row.contradiction,
      row.box_folder_id,
      row.box_casefile_id,
      row.created_at,
      row.updated_at,
    );
  }
  db.prepare('DELETE FROM kv WHERE k = ?').run(key);
}

function recentTrial(
  db: DB,
  householdId: string,
  sha256: string,
  now: Date,
): LetterRow | undefined {
  return db
    .prepare(
      `SELECT * FROM letters
        WHERE household_id = ? AND sha256 = ? AND source = 'sample' AND trial = 1
          AND created_at > ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(householdId, sha256, new Date(now.getTime() - DEMO_TRIAL_TTL_MS).toISOString()) as
    | LetterRow
    | undefined;
}

function demoLetterDTO(db: DB, row: LetterRow): LetterDTO {
  const dto = buildLetterDTO(db, row);
  return letterSchema.parse({
    ...dto,
    submittedBy: null,
    imageUrl: `/api/demo/letters/${encodeURIComponent(row.id)}/image`,
    outbox: dto.outbox.map((item) => ({
      ...item,
      toEmail: item.kind === 'parent_note' ? 'ruth@example.invalid' : 'family@example.invalid',
      agentmailMessageId: null,
      agentmailThreadId: null,
    })),
    decision: dto.decision
      ? {
          ...dto.decision,
          rawResponseUrl: `/api/demo/letters/${encodeURIComponent(row.id)}/decision`,
        }
      : null,
  });
}

function demoCaseDTO(db: DB, row: CaseRow): CaseDTO {
  const dto = buildCaseDTO(db, row);
  const receivedAt = new Map(dto.letters.map((letter) => [letter.id, letter.receivedAt]));
  return caseSchema.parse({
    ...dto,
    boxFolderUrl: null,
    letters: dto.letters.map((letter) => ({
      ...letter,
      imageUrl: `/api/demo/letters/${encodeURIComponent(letter.id)}/image`,
    })),
    events: dto.events.map((event) => ({
      ...event,
      createdAt: event.letterId
        ? (receivedAt.get(event.letterId) ?? event.createdAt)
        : event.createdAt,
    })),
  });
}

function demoTodayDTO(dto: TodayDTO): TodayDTO {
  const withDemoImage = (letter: TodayDTO['recent'][number]) => ({
    ...letter,
    imageUrl: `/api/demo/letters/${encodeURIComponent(letter.id)}/image`,
  });
  return todaySchema.parse({
    ...dto,
    handledThisWeek: {
      ...dto.handledThisWeek,
      items: dto.handledThisWeek.items.map(withDemoImage),
    },
    recent: dto.recent.map(withDemoImage),
  });
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function bodyBytes(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function intakeErrorResponse(context: Context, error: IntakeError): Response {
  const status =
    error.code === 'too_large'
      ? 413
      : error.code === 'unsupported' || error.code === 'heic'
        ? 415
        : 400;
  return context.json({ error: error.code }, status);
}

function enqueue(deps: DemoDeps, letterId: string): void {
  try {
    void Promise.resolve(deps.queue.enqueue(letterId)).catch((error: unknown) => {
      log.warn(
        { event: 'demo_queue_failed', letterId },
        error instanceof Error ? error.message : String(error),
      );
    });
  } catch (error) {
    log.warn(
      { event: 'demo_queue_failed', letterId },
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function demoRoutes(deps: DemoDeps): Hono {
  const app = new Hono();
  const clock = deps.now ?? (() => new Date());
  const fileReader = deps.readFile ?? readFile;
  const intake = deps.intake ?? intakeFile;
  const limiter = new SlidingWindowRateLimiter(() => clock().getTime());

  app.use('*', async (context, next) => {
    await next();
    if (!context.res.headers.has('Cache-Control')) context.header('Cache-Control', 'no-store');
  });
  app.onError((error, context) => {
    log.error({ event: 'demo_api_error' }, error instanceof Error ? error.message : String(error));
    return context.json({ error: 'internal' }, 500);
  });

  app.get('/api/demo/today', (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    const today = buildTodayDTO(
      deps.db,
      { household_id: deps.config.MAILKEEP_DEMO_HOUSEHOLD_ID },
      clock,
    );
    return today ? context.json(demoTodayDTO(today)) : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/demo/cases/:id', (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    const row = demoCase(deps.db, deps.config.MAILKEEP_DEMO_HOUSEHOLD_ID, context.req.param('id'));
    return row
      ? context.json(demoCaseDTO(deps.db, row))
      : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/demo/letters/:id', (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    const row = demoLetter(
      deps.db,
      deps.config.MAILKEEP_DEMO_HOUSEHOLD_ID,
      context.req.param('id'),
    );
    return row
      ? context.json(demoLetterDTO(deps.db, row))
      : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/demo/letters/:id/image', async (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    const row = demoLetter(
      deps.db,
      deps.config.MAILKEEP_DEMO_HOUSEHOLD_ID,
      context.req.param('id'),
    );
    if (!row) return context.json({ error: 'not_found' }, 404);
    let bytes: Buffer;
    try {
      bytes = await fileReader(row.local_path);
    } catch (error) {
      if (missingFile(error)) return context.json({ error: 'not_found' }, 404);
      throw error;
    }
    const mime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(row.mime)
      ? row.mime
      : 'application/octet-stream';
    context.header('Content-Type', mime);
    context.header('Cache-Control', 'private, max-age=3600');
    context.header('X-Content-Type-Options', 'nosniff');
    return context.body(bodyBytes(bytes));
  });

  app.get('/api/demo/letters/:id/decision', (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    const letter = demoLetter(
      deps.db,
      deps.config.MAILKEEP_DEMO_HOUSEHOLD_ID,
      context.req.param('id'),
    );
    if (!letter) return context.json({ error: 'not_found' }, 404);
    const decision = deps.db
      .prepare(
        `SELECT response_json FROM decisions
          WHERE letter_id = ? AND household_id = ?
          ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(letter.id, deps.config.MAILKEEP_DEMO_HOUSEHOLD_ID) as
      | { response_json: string }
      | undefined;
    if (!decision) return context.json({ error: 'not_found' }, 404);
    return context.body(decision.response_json, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.get('/api/demo/samples', (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    return context.json(DEMO_SAMPLE_IDS.map(sampleDTO));
  });

  app.get('/api/demo/samples/:id/image', async (context) => {
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);
    const id = context.req.param('id');
    if (!isSampleId(id)) return context.json({ error: 'not_found' }, 404);
    let bytes: Buffer;
    try {
      bytes = await fileReader(samplePath(id));
    } catch (error) {
      if (missingFile(error)) return context.json({ error: 'not_found' }, 404);
      throw error;
    }
    context.header('Content-Type', 'image/jpeg');
    context.header('Cache-Control', 'public, max-age=3600');
    context.header('X-Content-Type-Options', 'nosniff');
    return context.body(bodyBytes(bytes));
  });

  app.post('/api/demo/samples/:id/run', async (context) => {
    const id = context.req.param('id');
    if (!isSampleId(id)) return context.json({ error: 'not_found' }, 404);
    if (!demoHousehold(deps.db, deps.config, clock()))
      return context.json({ error: 'not_found' }, 404);

    const ipLimit = limiter.check(`ip:${clientIp(context)}`, SAMPLE_IP_RATE, HOUR_MS);
    if (!ipLimit.allowed) {
      context.header('Retry-After', String(ipLimit.retryAfterSeconds));
      return context.json({ error: 'rate_limited' }, 429);
    }
    const globalLimit = limiter.check('global', SAMPLE_GLOBAL_RATE, HOUR_MS);
    if (!globalLimit.allowed) {
      context.header('Retry-After', String(globalLimit.retryAfterSeconds));
      return context.json({ error: 'rate_limited' }, 429);
    }

    let bytes: Buffer;
    try {
      bytes = await fileReader(samplePath(id));
    } catch (error) {
      if (missingFile(error)) return context.json({ error: 'not_found' }, 404);
      throw error;
    }
    const now = clock();
    const household = demoHousehold(deps.db, deps.config, clock());
    if (!household) return context.json({ error: 'not_found' }, 404);
    const householdId = household.id;
    const receivedAt = householdNow(household, now).toISOString();
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = recentTrial(deps.db, householdId, sha256, now);
    if (existing) return context.json(demoLetterDTO(deps.db, existing), 202);

    let result: IntakeResult;
    try {
      result = await intake({
        bytes,
        householdId,
        dataDir: deps.config.MAILKEEP_DATA_DIR,
        db: deps.db,
      });
    } catch (error) {
      if (error instanceof IntakeError) return intakeErrorResponse(context, error);
      throw error;
    }

    if (result.duplicate) {
      const duplicate = demoLetter(deps.db, householdId, result.letterId);
      if (
        duplicate &&
        duplicate.sha256 === sha256 &&
        duplicate.source === 'sample' &&
        duplicate.trial &&
        Date.parse(duplicate.created_at) > now.getTime() - DEMO_TRIAL_TTL_MS
      ) {
        return context.json(demoLetterDTO(deps.db, duplicate), 202);
      }
      return context.json({ error: 'sample_conflict' }, 409);
    }

    try {
      deps.db
        .prepare(
          `INSERT INTO letters
            (id, household_id, source, trial, submitted_by, received_at, status, mime,
             sha256, local_path, created_at, updated_at)
            VALUES (?, ?, 'sample', 1, NULL, ?, 'queued', ?, ?, ?, ?, ?)`,
        )
        .run(
          result.letterId,
          householdId,
          receivedAt,
          result.mime,
          result.sha256,
          result.localPath,
          now.toISOString(),
          now.toISOString(),
        );
    } catch (error) {
      const raced = recentTrial(deps.db, householdId, sha256, now);
      await rm(result.localPath, { force: true }).catch(() => {});
      if (raced) return context.json(demoLetterDTO(deps.db, raced), 202);
      throw error;
    }

    const row = demoLetter(deps.db, householdId, result.letterId);
    if (!row) throw new Error('Sample letter was not persisted');
    ensureCaseBaseline(deps.db, householdId);
    const dto = demoLetterDTO(deps.db, row);
    enqueue(deps, row.id);
    return context.json(dto, 202);
  });

  return app;
}

interface ExpiredTrialRow {
  id: string;
  household_id: string;
  case_id: string | null;
  local_path: string;
  pinecone_namespace: string;
}

/**
 * Deletes trials older than 24 hours. Pinecone is cleaned first so a provider
 * failure leaves the DB rows available for a retry. Box files are intentionally
 * left alone. Without a client, only local DB/files cleanup is performed.
 */
export async function purgeExpiredTrials(
  db: DB,
  client?: GatewayClient,
  now: Date | Clock = () => new Date(),
): Promise<number> {
  const current = now instanceof Date ? now : now();
  if (Number.isNaN(current.getTime())) throw new Error('Invalid purge clock');
  const cutoff = new Date(current.getTime() - DEMO_TRIAL_TTL_MS).toISOString();
  const rows = db
    .prepare(
      `SELECT l.id, l.household_id, l.case_id, l.local_path, h.pinecone_namespace
        FROM letters l
        JOIN households h ON h.id = l.household_id
        WHERE l.trial = 1 AND l.source = 'sample' AND l.created_at <= ?
        ORDER BY l.created_at, l.id`,
    )
    .all(cutoff) as ExpiredTrialRow[];
  if (rows.length === 0) return 0;

  if (client) {
    const namespaces = new Map<string, string[]>();
    for (const row of rows) {
      const ids = namespaces.get(row.pinecone_namespace) ?? [];
      ids.push(row.id);
      namespaces.set(row.pinecone_namespace, ids);
    }
    const index = process.env.MAILKEEP_PINECONE_INDEX || 'mailkeep-letters';
    for (const [namespace, ids] of namespaces) {
      await forget(client, { index, namespace, ids });
    }
  }

  let deleted = 0;
  const localPaths: string[] = [];
  const householdIds = new Set<string>();
  const caseIds = new Map<string, { householdId: string; caseId: string }>();
  db.transaction(() => {
    for (const row of rows) {
      householdIds.add(row.household_id);
      db.prepare(
        `DELETE FROM outbox
          WHERE household_id = ? AND (
            related_id = ? OR substr(related_id, 1, ?) = ?
            OR related_id IN (SELECT id FROM asks WHERE household_id = ? AND letter_id = ?)
          )`,
      ).run(row.household_id, row.id, row.id.length + 1, `${row.id}:`, row.household_id, row.id);
      db.prepare('DELETE FROM asks WHERE household_id = ? AND letter_id = ?').run(
        row.household_id,
        row.id,
      );
      db.prepare('DELETE FROM case_events WHERE household_id = ? AND letter_id = ?').run(
        row.household_id,
        row.id,
      );
      db.prepare(
        'DELETE FROM relations WHERE household_id = ? AND (letter_id = ? OR other_letter_id = ?)',
      ).run(row.household_id, row.id, row.id);
      db.prepare('DELETE FROM decisions WHERE household_id = ? AND letter_id = ?').run(
        row.household_id,
        row.id,
      );
      db.prepare('DELETE FROM checks WHERE household_id = ? AND letter_id = ?').run(
        row.household_id,
        row.id,
      );
      db.prepare('DELETE FROM kv WHERE k IN (?, ?)').run(`route:${row.id}`, `acted:${row.id}`);
      deleted += db
        .prepare(
          "DELETE FROM letters WHERE id = ? AND household_id = ? AND trial = 1 AND source = 'sample'",
        )
        .run(row.id, row.household_id).changes;
      localPaths.push(row.local_path);
      if (row.case_id) {
        caseIds.set(`${row.household_id}\u0000${row.case_id}`, {
          householdId: row.household_id,
          caseId: row.case_id,
        });
      }
    }

    for (const { householdId, caseId } of caseIds.values()) {
      const remaining = db
        .prepare('SELECT 1 FROM letters WHERE household_id = ? AND case_id = ? LIMIT 1')
        .get(householdId, caseId);
      if (remaining) continue;
      db.prepare(
        `DELETE FROM outbox WHERE household_id = ? AND (
          related_id = ? OR related_id IN (SELECT id FROM asks WHERE household_id = ? AND case_id = ?)
        )`,
      ).run(householdId, caseId, householdId, caseId);
      db.prepare('DELETE FROM asks WHERE household_id = ? AND case_id = ?').run(
        householdId,
        caseId,
      );
      db.prepare('DELETE FROM case_events WHERE household_id = ? AND case_id = ?').run(
        householdId,
        caseId,
      );
      db.prepare('DELETE FROM cases WHERE id = ? AND household_id = ?').run(caseId, householdId);
    }

    for (const householdId of householdIds) {
      db.prepare('DELETE FROM kv WHERE k LIKE ?').run(`case-sync:${householdId}:%`);
      const remaining = db
        .prepare('SELECT 1 FROM letters WHERE household_id = ? AND trial = 1 LIMIT 1')
        .get(householdId);
      if (!remaining) restoreCaseBaseline(db, householdId);
    }
  })();

  await Promise.all(localPaths.map((localPath) => rm(localPath, { force: true }).catch(() => {})));
  return deleted;
}
