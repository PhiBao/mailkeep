import { T } from '@mailkeep/shared';
import { nanoid } from 'nanoid';
import { updateCaseFile } from '../act/box.js';
import { addCaseEvent } from '../cases/repo.js';
import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import { purgeExpiredTrials } from '../http/routes/demo.js';
import { pollAgentMail } from '../http/routes/hooks.js';
import { askEmail } from '../notify/templates.js';
import type { PipelineQueue } from '../pipeline/queue.js';
import { todayIso } from '../util/clock.js';
import { log } from '../util/log.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ASK_DEDUPE_MS = 72 * HOUR_MS;
const ASK_EXPIRY_MS = 14 * DAY_MS;

interface HouseholdRow {
  id: string;
  name: string;
  parent_display: string;
  is_demo: number;
  clock_offset_days: number;
  timezone: string;
}

interface CaseRow {
  id: string;
  household_id: string;
  title: string;
  counterparty: string;
  kind: string;
  status: 'open' | 'overdue' | 'paid' | 'closed' | 'watch';
  amount_cents: number | null;
  due_date: string | null;
}

interface MemberRow {
  email: string;
  role: 'parent' | 'family';
}

export interface TickDeps {
  config: Config;
  db: DB;
  client: GatewayClient;
  queue: PipelineQueue;
  now?: () => Date;
  poll?: () => Promise<void>;
  purge?: () => Promise<number>;
  syncCase?: (householdId: string, caseId: string) => Promise<void>;
}

export interface TickResult {
  ran: boolean;
  asks: number;
  overdue: number;
  digests: number;
  purged: number;
}

function daysLeft(today: string, dueDate: string): number {
  return Math.floor(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
}

function localDate(value: string, timezone: string): string | null {
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

function localHour(value: string, timezone: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  return hour === undefined ? null : Number(hour);
}

function cleanSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function insertOutbox(
  db: DB,
  input: {
    householdId: string;
    to: string;
    kind: 'ask' | 'family_alert' | 'digest';
    subject: string;
    body: string;
    relatedId: string;
  },
): void {
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    `out_${nanoid()}`,
    input.householdId,
    input.to,
    input.kind,
    cleanSubject(input.subject),
    input.body,
    input.relatedId,
    new Date().toISOString(),
  );
}

function queuePaidAsk(
  deps: TickDeps,
  household: HouseholdRow,
  caseRow: CaseRow,
  today: string,
): void {
  const question = `Was the ${caseRow.counterparty} ${caseRow.kind}${caseRow.amount_cents === null ? '' : ` ($${(caseRow.amount_cents / 100).toFixed(2)})`} paid? It's due ${caseRow.due_date}.`;
  const options = [
    { value: 'paid', label: 'Paid' },
    { value: 'not_paid', label: 'Not paid' },
    { value: 'not_ours', label: 'Not ours' },
  ];
  const askId = `ask_${nanoid()}`;
  const now = (deps.now?.() ?? new Date()).toISOString();
  deps.db
    .prepare(
      `INSERT INTO asks
      (id, household_id, letter_id, case_id, qtype, question, evidence, options_json, status, created_at)
     VALUES (?, ?, NULL, ?, 'paid', ?, ?, ?, 'open', ?)`,
    )
    .run(
      askId,
      household.id,
      caseRow.id,
      question,
      `due in ${daysLeft(today, caseRow.due_date as string)} days`,
      JSON.stringify(options),
      now,
    );
  addCaseEvent(deps.db, {
    householdId: household.id,
    caseId: caseRow.id,
    type: 'asked',
    actor: 'agent',
    detail: { askId, qtype: 'paid' },
  });
  const email = askEmail({
    question,
    evidence: `Due ${caseRow.due_date}`,
    options,
    link: `${deps.config.MAILKEEP_PUBLIC_URL.replace(/\/$/, '')}/cases/${caseRow.id}`,
  });
  const family = deps.db
    .prepare("SELECT email FROM members WHERE household_id = ? AND role = 'family'")
    .all(household.id) as MemberRow[];
  for (const member of family) {
    insertOutbox(deps.db, {
      householdId: household.id,
      to: member.email,
      kind: 'ask',
      subject: email.subject,
      body: email.body,
      relatedId: askId,
    });
  }
}

function queueOverdueAlert(deps: TickDeps, household: HouseholdRow, caseRow: CaseRow): void {
  const relatedId = `${caseRow.id}:overdue`;
  const existing = deps.db
    .prepare('SELECT 1 FROM outbox WHERE household_id = ? AND related_id = ? LIMIT 1')
    .get(household.id, relatedId);
  if (existing) return;
  const family = deps.db
    .prepare("SELECT email FROM members WHERE household_id = ? AND role = 'family'")
    .all(household.id) as MemberRow[];
  const link = `${deps.config.MAILKEEP_PUBLIC_URL.replace(/\/$/, '')}/cases/${caseRow.id}`;
  for (const member of family) {
    insertOutbox(deps.db, {
      householdId: household.id,
      to: member.email,
      kind: 'family_alert',
      subject: `Overdue: ${caseRow.counterparty} ${caseRow.kind}`,
      body: `${caseRow.title} was due ${caseRow.due_date} and is still open.\n${link}`,
      relatedId,
    });
  }
}

async function defaultSyncCase(deps: TickDeps, householdId: string, caseId: string): Promise<void> {
  const models = deps.db
    .prepare(
      `SELECT DISTINCT d.model_id FROM decisions d
         JOIN letters l ON l.id = d.letter_id AND l.household_id = d.household_id
        WHERE l.household_id = ? AND l.case_id = ?`,
    )
    .all(householdId, caseId) as Array<{ model_id: string }>;
  await updateCaseFile(deps.client, deps.db, {
    householdId,
    caseId,
    modelIds: [deps.config.MAILKEEP_OLLAMA_MODEL, ...models.map((model) => model.model_id)],
  });
}

async function chaseHousehold(
  deps: TickDeps,
  household: HouseholdRow,
  now: Date,
): Promise<{ asks: number; overdue: number }> {
  const today = todayIso(household, now);
  const cases = deps.db
    .prepare(
      `SELECT * FROM cases
        WHERE household_id = ? AND status IN ('open', 'overdue') AND due_date IS NOT NULL
        ORDER BY due_date, id`,
    )
    .all(household.id) as CaseRow[];
  let asks = 0;
  let overdue = 0;
  for (const caseRow of cases) {
    const remaining = daysLeft(today, caseRow.due_date as string);
    if (remaining < 0 && caseRow.status === 'open') {
      deps.db
        .prepare(
          "UPDATE cases SET status = 'overdue', updated_at = ? WHERE id = ? AND household_id = ?",
        )
        .run(now.toISOString(), caseRow.id, household.id);
      addCaseEvent(deps.db, {
        householdId: household.id,
        caseId: caseRow.id,
        type: 'overdue',
        actor: 'agent',
        detail: { dueDate: caseRow.due_date, daysLeft: remaining },
      });
      queueOverdueAlert(deps, household, caseRow);
      overdue += 1;
    } else if (remaining >= 0 && remaining <= T.dueSoonDays) {
      const recentAsk = deps.db
        .prepare(
          `SELECT 1 FROM asks
            WHERE household_id = ? AND case_id = ? AND qtype = 'paid' AND created_at > ?
            LIMIT 1`,
        )
        .get(household.id, caseRow.id, new Date(now.getTime() - ASK_DEDUPE_MS).toISOString());
      if (!recentAsk) {
        queuePaidAsk(deps, household, caseRow, today);
        asks += 1;
      }
    }
    if (remaining < 0 || (remaining >= 0 && remaining <= T.dueSoonDays)) {
      try {
        if (deps.syncCase) await deps.syncCase(household.id, caseRow.id);
        else await defaultSyncCase(deps, household.id, caseRow.id);
      } catch (error) {
        log.warn(
          { event: 'chase_casefile_failed', householdId: household.id, caseId: caseRow.id },
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  return { asks, overdue };
}

function queueDigest(deps: TickDeps, household: HouseholdRow, now: Date): boolean {
  const today = todayIso(household, now);
  const key = `digest:${household.id}:${today}`;
  if (deps.db.prepare('SELECT 1 FROM kv WHERE k = ?').get(key)) return false;
  const letters = deps.db
    .prepare('SELECT * FROM letters WHERE household_id = ? ORDER BY received_at DESC LIMIT 200')
    .all(household.id) as Array<{
    id: string;
    title: string | null;
    lane: string | null;
    received_at: string;
  }>;
  const todays = letters.filter(
    (letter) => localDate(letter.received_at, household.timezone) === today,
  );
  const headsup = todays.filter((letter) => letter.lane === 'headsup');
  const handled = todays.filter((letter) => letter.lane === 'handled').length;
  const family = deps.db
    .prepare("SELECT email FROM members WHERE household_id = ? AND role = 'family'")
    .all(household.id) as MemberRow[];
  const lines = [
    `Mailkeep digest for ${household.parent_display} · ${today}`,
    '',
    ...(headsup.length > 0
      ? headsup.map((letter) => `Heads-up: ${letter.title ?? 'Letter'}`)
      : ['No new heads-up letters.']),
    `${handled} letters filed quietly.`,
  ];
  for (const member of family) {
    insertOutbox(deps.db, {
      householdId: household.id,
      to: member.email,
      kind: 'digest',
      subject: `Mailkeep digest: ${today}`,
      body: lines.join('\n'),
      relatedId: key,
    });
  }
  deps.db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run(key, now.toISOString());
  return true;
}

function expire(db: DB, now: Date): void {
  const timestamp = now.toISOString();
  db.prepare('DELETE FROM login_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(
    timestamp,
  );
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(timestamp);
  db.prepare("UPDATE asks SET status = 'expired' WHERE status = 'open' AND created_at <= ?").run(
    new Date(now.getTime() - ASK_EXPIRY_MS).toISOString(),
  );
}

export async function runTick(deps: TickDeps): Promise<TickResult> {
  const now = deps.now?.() ?? new Date();
  const previous = deps.db.prepare("SELECT v FROM kv WHERE k = 'last_tick_at'").get() as
    | { v: string }
    | undefined;
  if (
    previous &&
    now.getTime() - Date.parse(previous.v) < deps.config.MAILKEEP_TICK_MIN_INTERVAL_S * 1000
  ) {
    return { ran: false, asks: 0, overdue: 0, digests: 0, purged: 0 };
  }
  deps.db
    .prepare(
      "INSERT INTO kv (k, v) VALUES ('last_tick_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    )
    .run(now.toISOString());

  if (deps.poll) await deps.poll();
  else
    await pollAgentMail({
      config: deps.config,
      db: deps.db,
      client: deps.client,
      queue: deps.queue,
    });

  const households = deps.db
    .prepare('SELECT * FROM households WHERE is_demo = 0 ORDER BY id')
    .all() as HouseholdRow[];
  let asks = 0;
  let overdue = 0;
  let digests = 0;
  for (const household of households) {
    const chased = await chaseHousehold(deps, household, now);
    asks += chased.asks;
    overdue += chased.overdue;
    const hour = localHour(now.toISOString(), household.timezone);
    if (hour !== null && hour >= 18 && queueDigest(deps, household, now)) digests += 1;
  }
  expire(deps.db, now);
  const purged = deps.purge
    ? await deps.purge()
    : await purgeExpiredTrials(deps.db, deps.client, now);
  const result = { ran: true, asks, overdue, digests, purged };
  log.info({ event: 'tick_complete', ...result }, 'Chase tick complete');
  return result;
}
