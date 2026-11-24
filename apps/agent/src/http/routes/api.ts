import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import {
  askAnswerSchema,
  askSchema,
  type CaseDTO,
  caseSchema,
  type HouseholdDTO,
  householdSchema,
  type LetterDTO,
  letterSchema,
  type TodayDTO,
  todaySchema,
} from '@mailkeep/shared';
import { type Context, Hono } from 'hono';
import { transitionCase } from '../../cases/machine.js';
import { addCaseEvent } from '../../cases/repo.js';
import type { Config } from '../../config.js';
import type { DB } from '../../db/db.js';
import { applyAskAnswer } from '../../notify/replies.js';
import {
  IntakeError,
  type IntakeResult,
  intakeFile,
  MAX_FILE_BYTES,
  MAX_FILES_PER_INTAKE,
  sniffMime,
} from '../../pipeline/intake.js';
import type { PipelineQueue } from '../../pipeline/queue.js';
import { todayIso } from '../../util/clock.js';
import { log } from '../../util/log.js';
import { csrfProtection } from '../csrf.js';
import {
  type Clock,
  getHouseholdRow,
  requireFamily,
  requireMember,
  type SessionMember,
} from '../session.js';

const DAY_MS = 86_400_000;
const RECENT_LIMIT = 8;
export const MAX_UPLOAD_BODY_BYTES = 60 * 1024 * 1024;

interface HouseholdRow {
  id: string;
  name: string;
  parent_display: string;
  is_demo: number;
  clock_offset_days: number;
  timezone: string;
}

interface LetterRow {
  id: string;
  household_id: string;
  source: string;
  trial: number;
  submitted_by: string | null;
  received_at: string;
  status: string;
  mime: string;
  local_path: string;
  transcript: string | null;
  sender_org: string | null;
  title: string | null;
  summary_parent: string | null;
  todo_parent: string | null;
  kind: string | null;
  lane: string | null;
  amount_cents: number | null;
  due_date: string | null;
  account_tail: string | null;
  phones_json: string | null;
  scam_rule_hits_json: string | null;
  case_id: string | null;
  error: string | null;
  jev_tokens: number;
  ollama_in_tokens: number;
  ollama_out_tokens: number;
  cost_microusd: number;
}

interface CaseRow {
  id: string;
  household_id: string;
  title: string;
  counterparty: string;
  kind: string;
  status: string;
  amount_cents: number | null;
  due_date: string | null;
  account_tail: string | null;
  second_notice: number;
  contradiction: number;
  box_folder_id: string | null;
}

interface AskRow {
  id: string;
  household_id: string;
  letter_id: string | null;
  case_id: string | null;
  qtype: string;
  question: string;
  evidence: string;
  options_json: string;
  status: string;
  created_at: string;
}

interface DecisionRow {
  id: string;
  letter_id: string;
  household_id: string;
  model_id: string;
  request_json: string;
  response_json: string;
  latency_ms: number;
  created_at: string;
}

export interface ApiDeps {
  config: Config;
  db: DB;
  queue: Pick<PipelineQueue, 'enqueue'>;
  now?: Clock | undefined;
}

class UploadFailure extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = 'UploadFailure';
  }
}

function jsonValue(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: string | null): string[] {
  const parsed = jsonValue(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function askOptions(value: string): Array<{ value: string; label: string }> {
  const parsed = jsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    const option = jsonObject(item);
    return typeof option.value === 'string' && typeof option.label === 'string'
      ? [{ value: option.value, label: option.label }]
      : [];
  });
}

function imageUrl(letterId: string): string {
  return `/api/letters/${encodeURIComponent(letterId)}/image`;
}

function decisionUrl(letterId: string): string {
  return `/api/letters/${encodeURIComponent(letterId)}/decision`;
}

function letterSummary(row: LetterRow) {
  return {
    id: row.id,
    title: row.title ?? 'Letter',
    senderOrg: row.sender_org,
    receivedAt: row.received_at,
    status: row.status,
    lane: row.lane,
    kind: row.kind,
    summaryParent: row.summary_parent,
    todoParent: row.todo_parent,
    amountCents: row.amount_cents,
    dueDate: row.due_date,
    caseId: row.case_id,
    trial: Boolean(row.trial),
    imageUrl: imageUrl(row.id),
  };
}

function latestDecision(db: DB, letter: LetterRow): DecisionRow | undefined {
  return db
    .prepare(
      `SELECT * FROM decisions
        WHERE letter_id = ? AND household_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(letter.id, letter.household_id) as DecisionRow | undefined;
}

function sameMatterProbability(responseJson: string, index: number): number | null {
  const response = jsonObject(jsonValue(responseJson));
  const answers = jsonObject(response.answers);
  const answer = jsonObject(answers[`same_matter_${index}`]);
  return answer.type === 'noul' && typeof answer.noul === 'number' ? answer.noul : null;
}

function recallCandidates(db: DB, letter: LetterRow, decision: DecisionRow | undefined) {
  if (!decision) return [];
  const request = jsonObject(jsonValue(decision.request_json));
  const state = jsonObject(request.state);
  if (!Array.isArray(state.past)) return [];

  const past = state.past.flatMap((item, index) => {
    const entry = jsonObject(item);
    return typeof entry.id === 'string' && entry.id !== letter.id
      ? [{ id: entry.id, index, entry }]
      : [];
  });
  if (past.length === 0) return [];

  const placeholders = past.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM letters
        WHERE household_id = ? AND id IN (${placeholders})`,
    )
    .all(letter.household_id, ...past.map((item) => item.id)) as LetterRow[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const relationRows = db
    .prepare(
      `SELECT * FROM relations
        WHERE household_id = ? AND letter_id = ? AND relation = 'same_matter'
          AND other_letter_id IN (${placeholders})`,
    )
    .all(letter.household_id, letter.id, ...past.map((item) => item.id)) as Array<{
    other_letter_id: string;
    recall_score: number | null;
  }>;
  const scores = new Map(relationRows.map((row) => [row.other_letter_id, row.recall_score]));
  const seen = new Set<string>();

  return past.flatMap(({ id, index, entry }) => {
    const row = rowsById.get(id);
    if (!row || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        letterId: row.id,
        title: row.title ?? 'Letter',
        senderOrg: row.sender_org ?? (typeof entry.sender === 'string' ? entry.sender : null),
        receivedAt: row.received_at,
        kind: row.kind ?? (typeof entry.kind === 'string' ? entry.kind : null),
        lane: row.lane ?? (typeof entry.lane === 'string' ? entry.lane : null),
        recallScore: scores.get(id) ?? null,
        tailMatch: Boolean(
          letter.account_tail && row.account_tail && letter.account_tail === row.account_tail,
        ),
        sameMatterProbability: sameMatterProbability(decision.response_json, index),
      },
    ];
  });
}

function decisionDTO(letter: LetterRow, decision: DecisionRow | undefined) {
  if (!decision) return null;
  const request = jsonObject(jsonValue(decision.request_json));
  const response = jsonObject(jsonValue(decision.response_json));
  const questions = jsonObject(request.questions);
  const answers = jsonObject(response.answers);
  const usage = jsonObject(response.usage);
  const inputTokens = usage.input_tokens;
  return {
    modelId: decision.model_id,
    latencyMs: Math.max(0, Math.trunc(decision.latency_ms)),
    createdAt: decision.created_at,
    questionCount: Object.keys(Object.keys(questions).length > 0 ? questions : answers).length,
    jevTokens:
      typeof inputTokens === 'number' && Number.isFinite(inputTokens)
        ? Math.max(0, Math.trunc(inputTokens))
        : Math.max(0, Math.trunc(letter.jev_tokens)),
    ollamaInTokens: Math.max(0, Math.trunc(letter.ollama_in_tokens)),
    ollamaOutTokens: Math.max(0, Math.trunc(letter.ollama_out_tokens)),
    costMicrousd: Math.max(0, Math.trunc(letter.cost_microusd)),
    rawResponseUrl: decisionUrl(letter.id),
  };
}

function outboxRows(db: DB, letter: LetterRow) {
  return db
    .prepare(
      `SELECT * FROM outbox
        WHERE household_id = ? AND (
          related_id = ?
          OR related_id IN (
            SELECT id FROM asks WHERE household_id = ? AND letter_id = ?
          )
          OR substr(related_id, 1, ?) = ?
        )
        ORDER BY created_at, id`,
    )
    .all(
      letter.household_id,
      letter.id,
      letter.household_id,
      letter.id,
      letter.id.length + 1,
      `${letter.id}:`,
    ) as Array<{
    id: string;
    kind: string;
    to_email: string;
    subject: string;
    status: string;
    suppressed_reason: string | null;
    agentmail_message_id: string | null;
    agentmail_thread_id: string | null;
    created_at: string;
    sent_at: string | null;
  }>;
}

export function buildLetterDTO(db: DB, row: LetterRow): LetterDTO {
  const decision = latestDecision(db, row);
  const checks = db
    .prepare(
      `SELECT * FROM checks
        WHERE household_id = ? AND letter_id = ?
        ORDER BY id`,
    )
    .all(row.household_id, row.id) as Array<{
    id: string;
    key: string;
    label: string;
    qtype: string;
    answer: string;
    probability: number | null;
    confidence: number | null;
    threshold: number | null;
    outcome: string;
  }>;
  const relations = db
    .prepare(
      `SELECT r.* FROM relations r
        JOIN letters current ON current.id = r.letter_id AND current.household_id = r.household_id
        JOIN letters other ON other.id = r.other_letter_id AND other.household_id = r.household_id
        WHERE r.household_id = ? AND r.letter_id = ?
        ORDER BY r.created_at, r.id`,
    )
    .all(row.household_id, row.id) as Array<{
    id: string;
    letter_id: string;
    other_letter_id: string;
    relation: string;
    probability: number;
    recall_score: number | null;
    status: string;
    created_at: string;
  }>;

  return letterSchema.parse({
    id: row.id,
    householdId: row.household_id,
    source: row.source,
    trial: Boolean(row.trial),
    submittedBy: row.submitted_by,
    receivedAt: row.received_at,
    status: row.status,
    mime: row.mime,
    title: row.title ?? 'Letter',
    senderOrg: row.sender_org,
    summaryParent: row.summary_parent,
    todoParent: row.todo_parent,
    kind: row.kind,
    lane: row.lane,
    amountCents: row.amount_cents,
    dueDate: row.due_date,
    accountTail: row.account_tail,
    phones: stringArray(row.phones_json),
    scamRuleHits: stringArray(row.scam_rule_hits_json),
    transcript: row.transcript ?? '',
    caseId: row.case_id,
    error: row.error,
    imageUrl: imageUrl(row.id),
    checks: checks.map((check) => ({
      id: check.id,
      key: check.key,
      label: check.label,
      qtype: check.qtype,
      answer: check.answer,
      probability: check.probability,
      confidence: check.confidence,
      threshold: check.threshold,
      outcome: check.outcome,
    })),
    relations: relations.map((relation) => ({
      id: relation.id,
      letterId: relation.letter_id,
      otherLetterId: relation.other_letter_id,
      relation: relation.relation,
      probability: relation.probability,
      recallScore: relation.recall_score,
      status: relation.status,
      createdAt: relation.created_at,
    })),
    recall: recallCandidates(db, row, decision),
    outbox: outboxRows(db, row).map((outbox) => ({
      id: outbox.id,
      kind: outbox.kind,
      toEmail: outbox.to_email,
      subject: outbox.subject,
      status: outbox.status,
      suppressedReason: outbox.suppressed_reason,
      agentmailMessageId: outbox.agentmail_message_id,
      agentmailThreadId: outbox.agentmail_thread_id,
      createdAt: outbox.created_at,
      sentAt: outbox.sent_at,
    })),
    decision: decisionDTO(row, decision),
  });
}

export function buildCaseDTO(db: DB, row: CaseRow): CaseDTO {
  const letters = db
    .prepare(
      `SELECT * FROM letters
        WHERE household_id = ? AND case_id = ?
        ORDER BY received_at, id`,
    )
    .all(row.household_id, row.id) as LetterRow[];
  const events = db
    .prepare(
      `SELECT * FROM case_events
        WHERE household_id = ? AND case_id = ?
        ORDER BY created_at, id`,
    )
    .all(row.household_id, row.id) as Array<{
    id: string;
    case_id: string;
    letter_id: string | null;
    type: string;
    actor: string;
    member_id: string | null;
    detail_json: string;
    created_at: string;
  }>;
  const relations = db
    .prepare(
      `SELECT r.* FROM relations r
        JOIN letters current ON current.id = r.letter_id AND current.household_id = r.household_id
        JOIN letters other ON other.id = r.other_letter_id AND other.household_id = r.household_id
        WHERE r.household_id = ? AND (
          (current.household_id = ? AND current.case_id = ?)
          OR (other.household_id = ? AND other.case_id = ?)
        )
        ORDER BY r.created_at, r.id`,
    )
    .all(row.household_id, row.household_id, row.id, row.household_id, row.id) as Array<{
    id: string;
    letter_id: string;
    other_letter_id: string;
    relation: string;
    probability: number;
    recall_score: number | null;
    status: string;
    created_at: string;
  }>;

  return caseSchema.parse({
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    counterparty: row.counterparty,
    kind: row.kind,
    status: row.status,
    amountCents: row.amount_cents,
    dueDate: row.due_date,
    accountTail: row.account_tail,
    secondNotice: Boolean(row.second_notice),
    contradiction: Boolean(row.contradiction),
    boxFolderUrl: row.box_folder_id
      ? `https://app.box.com/folder/${encodeURIComponent(row.box_folder_id)}`
      : null,
    letters: letters.map(letterSummary),
    events: events.map((event) => ({
      id: event.id,
      caseId: event.case_id,
      letterId: event.letter_id,
      type: event.type,
      actor: event.actor,
      memberId: event.member_id,
      detail: jsonObject(jsonValue(event.detail_json)),
      createdAt: event.created_at,
    })),
    relations: relations.map((relation) => ({
      id: relation.id,
      letterId: relation.letter_id,
      otherLetterId: relation.other_letter_id,
      relation: relation.relation,
      probability: relation.probability,
      recallScore: relation.recall_score,
      status: relation.status,
      createdAt: relation.created_at,
    })),
  });
}

function dateInTimezone(value: string, timezone: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekStart(today: string): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function daysLeft(today: string, dueDate: string): number {
  return Math.floor(
    (Date.parse(`${dueDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / DAY_MS,
  );
}

export function buildTodayDTO(
  db: DB,
  member: Pick<SessionMember, 'household_id'>,
  clock: Clock,
): TodayDTO | null {
  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(member.household_id) as
    | HouseholdRow
    | undefined;
  if (!household) return null;
  const today = todayIso(household, clock());
  const askRows = db
    .prepare(
      `SELECT a.*, l.title AS letter_title FROM asks a
        LEFT JOIN letters l ON l.id = a.letter_id AND l.household_id = a.household_id
        WHERE a.household_id = ? AND a.status = 'open'
        ORDER BY a.created_at DESC, a.id DESC`,
    )
    .all(member.household_id) as Array<AskRow & { letter_title: string | null }>;
  const caseRows = db
    .prepare(
      `SELECT * FROM cases
        WHERE household_id = ? AND status IN ('open', 'overdue') AND due_date IS NOT NULL
        ORDER BY due_date, created_at, id`,
    )
    .all(member.household_id) as CaseRow[];
  const start = weekStart(today);
  const handledRows = db
    .prepare(
      `SELECT * FROM letters
        WHERE household_id = ? AND lane = 'handled' AND received_at >= ?
        ORDER BY received_at DESC, id DESC`,
    )
    .all(
      member.household_id,
      new Date(Date.parse(`${start}T00:00:00.000Z`) - DAY_MS).toISOString(),
    ) as LetterRow[];
  const handled = handledRows.filter(
    (row) => (dateInTimezone(row.received_at, household.timezone) ?? '') >= start,
  );
  const recent = db
    .prepare(
      `SELECT * FROM letters
        WHERE household_id = ?
        ORDER BY received_at DESC, id DESC LIMIT ?`,
    )
    .all(member.household_id, RECENT_LIMIT) as LetterRow[];

  return todaySchema.parse({
    household: householdSchema.parse({
      id: household.id,
      name: household.name,
      parentDisplay: household.parent_display,
      timezone: household.timezone,
      isDemo: Boolean(household.is_demo),
      today,
    }),
    asks: askRows.map((ask) =>
      askSchema.parse({
        id: ask.id,
        letterId: ask.letter_id,
        caseId: ask.case_id,
        qtype: ask.qtype,
        question: ask.question,
        evidence: ask.evidence,
        options: askOptions(ask.options_json),
        status: ask.status,
        createdAt: ask.created_at,
        letterTitle: ask.letter_title ?? 'Letter',
      }),
    ),
    upcoming: caseRows.map((row) => ({
      caseId: row.id,
      title: row.title,
      counterparty: row.counterparty,
      kind: row.kind,
      status: row.status,
      amountCents: row.amount_cents,
      dueDate: row.due_date,
      daysLeft: daysLeft(today, row.due_date as string),
      secondNotice: Boolean(row.second_notice),
    })),
    handledThisWeek: {
      count: handled.length,
      items: handled.slice(0, RECENT_LIMIT).map(letterSummary),
    },
    recent: recent.map(letterSummary),
  });
}

function householdDTO(row: HouseholdRow, clock: Clock): HouseholdDTO {
  return householdSchema.parse({
    id: row.id,
    name: row.name,
    parentDisplay: row.parent_display,
    timezone: row.timezone,
    isDemo: Boolean(row.is_demo),
    today: todayIso(row, clock()),
  });
}

async function multipartFiles(request: Request): Promise<File[]> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    throw new UploadFailure('invalid_multipart', 415, 'Expected multipart/form-data.');
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isSafeInteger(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
    throw new UploadFailure('too_large', 413, 'Uploads must be 60 MiB or smaller.');
  }
  if (!request.body) throw new UploadFailure('invalid_multipart', 400, 'Missing upload body.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_UPLOAD_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new UploadFailure('too_large', 413, 'Uploads must be 60 MiB or smaller.');
      }
      size += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bounded = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: Buffer.concat(chunks, size),
    });
    const form = await bounded.formData();
    const values: unknown[] = [...form.values()];
    return values.filter((value): value is File => value instanceof File);
  } catch (error) {
    if (error instanceof UploadFailure) throw error;
    throw new UploadFailure('invalid_multipart', 400, 'Could not read the multipart upload.');
  }
}

function intakeErrorResponse(context: Context, error: IntakeError) {
  const status =
    error.code === 'too_large'
      ? 413
      : error.code === 'unsupported' || error.code === 'heic'
        ? 415
        : 400;
  return context.json({ error: error.code }, status);
}

function enqueue(deps: ApiDeps, letterId: string): void {
  try {
    void Promise.resolve(deps.queue.enqueue(letterId)).catch((error: unknown) => {
      log.warn(
        { event: 'api_queue_failed', letterId },
        error instanceof Error ? error.message : String(error),
      );
    });
  } catch (error) {
    log.warn(
      { event: 'api_queue_failed', letterId },
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function apiRoutes(deps: ApiDeps): Hono {
  const app = new Hono();
  const clock = deps.now ?? (() => new Date());
  const memberAuth = requireMember(deps.db, clock);
  const familyAuth = requireFamily(deps.db, clock);
  const csrf = csrfProtection(deps.config.MAILKEEP_PUBLIC_URL);

  app.use('*', async (context, next) => {
    await next();
    if (!context.res.headers.has('Cache-Control')) context.header('Cache-Control', 'no-store');
  });
  app.onError((error, context) => {
    log.error({ event: 'api_error' }, error instanceof Error ? error.message : String(error));
    return context.json({ error: 'internal' }, 500);
  });

  app.get('/api/me', memberAuth, (context) => {
    const member = context.get('member');
    const row = dbHousehold(deps.db, member.household_id);
    return row ? context.json(householdDTO(row, clock)) : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/today', familyAuth, (context) => {
    const today = buildTodayDTO(deps.db, context.get('member'), clock);
    return today ? context.json(today) : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/cases/:id', memberAuth, (context) => {
    const row = getHouseholdRow<CaseRow>(
      deps.db,
      context.get('member'),
      'cases',
      context.req.param('id'),
    );
    return row
      ? context.json(buildCaseDTO(deps.db, row))
      : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/letters/:id', memberAuth, (context) => {
    const row = getHouseholdRow<LetterRow>(
      deps.db,
      context.get('member'),
      'letters',
      context.req.param('id'),
    );
    return row
      ? context.json(buildLetterDTO(deps.db, row))
      : context.json({ error: 'not_found' }, 404);
  });

  app.get('/api/letters/:id/image', memberAuth, async (context) => {
    const row = getHouseholdRow<LetterRow>(
      deps.db,
      context.get('member'),
      'letters',
      context.req.param('id'),
    );
    if (!row) return context.json({ error: 'not_found' }, 404);
    let bytes: Buffer;
    try {
      bytes = await readFile(row.local_path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return context.json({ error: 'not_found' }, 404);
      }
      throw error;
    }
    const mime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(row.mime)
      ? row.mime
      : 'application/octet-stream';
    context.header('Content-Type', mime);
    context.header('Cache-Control', 'private, max-age=3600');
    context.header('X-Content-Type-Options', 'nosniff');
    return context.body(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
  });

  app.get('/api/letters/:id/decision', memberAuth, (context) => {
    const letter = getHouseholdRow<LetterRow>(
      deps.db,
      context.get('member'),
      'letters',
      context.req.param('id'),
    );
    if (!letter) return context.json({ error: 'not_found' }, 404);
    const decision = latestDecision(deps.db, letter);
    if (!decision) return context.json({ error: 'not_found' }, 404);
    return context.body(decision.response_json, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.post('/api/letters', memberAuth, csrf, async (context) => {
    let files: File[];
    try {
      files = await multipartFiles(context.req.raw);
    } catch (error) {
      if (error instanceof UploadFailure) return context.json({ error: error.code }, error.status);
      throw error;
    }
    if (files.length === 0) return context.json({ error: 'no_files' }, 400);
    if (files.length > MAX_FILES_PER_INTAKE) {
      return context.json({ error: 'too_many_files' }, 413);
    }

    try {
      for (const file of files) {
        if (file.size === 0) throw new IntakeError('invalid', 'The file is empty.');
        if (file.size > MAX_FILE_BYTES) throw new IntakeError('too_large', 'File is too large.');
        const signature = Buffer.from(await file.slice(0, 16).arrayBuffer());
        const mime = sniffMime(signature);
        if (mime === 'heic') throw new IntakeError('heic', 'HEIC is not supported.');
        if (!mime) throw new IntakeError('unsupported', 'Unsupported file type.');
      }
    } catch (error) {
      if (error instanceof IntakeError) return intakeErrorResponse(context, error);
      throw error;
    }

    const member = context.get('member');
    const accepted = new Map<string, IntakeResult>();
    const created: IntakeResult[] = [];
    const seenHashes = new Set<string>();
    try {
      for (const file of files) {
        const bytes = Buffer.from(await file.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (seenHashes.has(sha256)) continue;
        seenHashes.add(sha256);
        const result = await intakeFile({
          bytes,
          householdId: member.household_id,
          dataDir: deps.config.MAILKEEP_DATA_DIR,
          db: deps.db,
        });
        accepted.set(result.sha256, result);
        if (!result.duplicate) created.push(result);
      }

      const receivedAt = clock().toISOString();
      const now = receivedAt;
      deps.db.transaction(() => {
        for (const result of created) {
          deps.db
            .prepare(
              `INSERT INTO letters
                (id, household_id, source, trial, submitted_by, received_at, status, mime,
                 sha256, local_path, created_at, updated_at)
               VALUES (?, ?, 'upload', 0, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
            )
            .run(
              result.letterId,
              member.household_id,
              member.id,
              receivedAt,
              result.mime,
              result.sha256,
              result.localPath,
              now,
              now,
            );
        }
      })();
    } catch (error) {
      await Promise.all(
        created.map((result) => rm(result.localPath, { force: true }).catch(() => {})),
      );
      if (error instanceof IntakeError) return intakeErrorResponse(context, error);
      throw error;
    }

    const letters = [...accepted.values()].flatMap((result) => {
      const row = getHouseholdRow<LetterRow>(deps.db, member, 'letters', result.letterId);
      return row ? [buildLetterDTO(deps.db, row)] : [];
    });
    const validated = letterSchema.array().parse(letters);
    for (const result of created) enqueue(deps, result.letterId);
    return context.json(validated, 202);
  });

  app.post('/api/letters/:id/retry', familyAuth, csrf, (context) => {
    const member = context.get('member');
    const row = getHouseholdRow<LetterRow>(deps.db, member, 'letters', context.req.param('id'));
    if (!row) return context.json({ error: 'not_found' }, 404);
    if (row.status !== 'failed') return context.json({ error: 'not_retryable' }, 409);
    const now = clock().toISOString();
    const changed = deps.db
      .prepare(
        `UPDATE letters SET status = 'queued', error = NULL, updated_at = ?
          WHERE id = ? AND household_id = ? AND status = 'failed'`,
      )
      .run(now, row.id, member.household_id).changes;
    if (changed !== 1) return context.json({ error: 'not_retryable' }, 409);
    enqueue(deps, row.id);
    const updated = getHouseholdRow<LetterRow>(deps.db, member, 'letters', row.id);
    return updated
      ? context.json(buildLetterDTO(deps.db, updated), 202)
      : context.json({ error: 'not_found' }, 404);
  });

  app.post('/api/asks/:id/answer', familyAuth, csrf, async (context) => {
    const member = context.get('member');
    const ask = getHouseholdRow<AskRow>(deps.db, member, 'asks', context.req.param('id'));
    if (!ask) return context.json({ error: 'not_found' }, 404);
    if (ask.letter_id && !getHouseholdRow(deps.db, member, 'letters', ask.letter_id)) {
      return context.json({ error: 'not_found' }, 404);
    }
    if (ask.case_id && !getHouseholdRow(deps.db, member, 'cases', ask.case_id)) {
      return context.json({ error: 'not_found' }, 404);
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'invalid_answer' }, 400);
    }
    const parsed = askAnswerSchema.safeParse(body);
    if (!parsed.success) return context.json({ error: 'invalid_answer' }, 400);
    if (ask.status !== 'open') return context.json({ error: 'ask_closed' }, 409);
    if (!askOptions(ask.options_json).some((option) => option.value === parsed.data.answer)) {
      return context.json({ error: 'invalid_answer' }, 400);
    }

    const result = applyAskAnswer(deps.db, {
      askId: ask.id,
      memberId: member.id,
      answer: parsed.data.answer,
      via: 'web',
    });
    if (!result) return context.json({ error: 'ask_closed' }, 409);
    if (result.letterId) {
      const letter = getHouseholdRow<LetterRow>(deps.db, member, 'letters', result.letterId);
      if (!letter) return context.json({ error: 'not_found' }, 404);
      return context.json(buildLetterDTO(deps.db, letter));
    }
    if (result.caseId) {
      const caseRow = getHouseholdRow<CaseRow>(deps.db, member, 'cases', result.caseId);
      if (!caseRow) return context.json({ error: 'not_found' }, 404);
      return context.json(buildCaseDTO(deps.db, caseRow));
    }
    const today = buildTodayDTO(deps.db, member, clock);
    return today ? context.json(today) : context.json({ error: 'not_found' }, 404);
  });

  const caseAction = (event: 'marked_paid' | 'reopened') => (context: Context) => {
    const member = context.get('member');
    const caseId = context.req.param('id');
    if (!caseId) return context.json({ error: 'not_found' }, 404);
    const row = getHouseholdRow<CaseRow>(deps.db, member, 'cases', caseId);
    if (!row) return context.json({ error: 'not_found' }, 404);
    let status: string;
    try {
      status = transitionCase(row.status as Parameters<typeof transitionCase>[0], event);
    } catch {
      return context.json({ error: 'invalid_transition' }, 409);
    }
    const now = clock().toISOString();
    deps.db.transaction(() => {
      const changed = deps.db
        .prepare(
          `UPDATE cases SET status = ?, updated_at = ?
            WHERE id = ? AND household_id = ? AND status = ?`,
        )
        .run(status, now, row.id, member.household_id, row.status).changes;
      if (changed !== 1) throw new Error('Case changed while applying the action.');
      addCaseEvent(deps.db, {
        householdId: member.household_id,
        caseId: row.id,
        type: event,
        actor: 'member',
        memberId: member.id,
        detail: { via: 'web' },
      });
    })();
    const updated = getHouseholdRow<CaseRow>(deps.db, member, 'cases', row.id);
    return updated
      ? context.json(buildCaseDTO(deps.db, updated))
      : context.json({ error: 'not_found' }, 404);
  };

  app.post('/api/cases/:id/mark-paid', familyAuth, csrf, caseAction('marked_paid'));
  app.post('/api/cases/:id/reopen', familyAuth, csrf, caseAction('reopened'));

  return app;
}

function dbHousehold(db: DB, householdId: string): HouseholdRow | undefined {
  return db.prepare('SELECT * FROM households WHERE id = ?').get(householdId) as
    | HouseholdRow
    | undefined;
}
