import { KINDS, type Kind } from '@mailkeep/shared';
import { nanoid } from 'nanoid';
import { updateCaseFile } from '../act/box.js';
import {
  addCaseEvent,
  getCase,
  queueCaseFileSync,
  replaceRelations,
  saveCaseChange,
  saveRelations,
} from '../cases/repo.js';
import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import {
  type CaseChange,
  type RouteAnswer,
  type RouteCheck,
  type RouteInput,
  type RouteOutput,
  type RoutePast,
  route,
} from '../pipeline/route.js';
import { type SystemOneResponse, systemOne } from '../providers/typesafe.js';
import { parseUsd } from '../util/money.js';
import { familyAlert, parentNote } from './templates.js';

const REPLY_CONFIDENCE = 0.7;

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
  agentmail_thread_id: string | null;
}

interface LetterRow {
  id: string;
  household_id: string;
  source: string;
  trial: number;
  title: string | null;
  sender_org: string | null;
  claims_government: number;
  transcript: string | null;
  phones_json: string | null;
  quality_json: string | null;
  scam_rule_hits_json: string | null;
  case_id: string | null;
  lane: string | null;
  kind: string | null;
  amount_cents: number | null;
  due_date: string | null;
  received_at: string;
  local_path: string;
  mime: string;
  summary_parent: string | null;
  todo_parent: string | null;
  box_file_id: string | null;
}

interface StoredPast {
  id: string;
  received: string;
  sender: string | null;
  kind: Kind | null;
  case_status: RoutePast['caseStatus'];
  amount: string | null;
  due: string | null;
  lane: RoutePast['lane'];
  text: string;
  phones: string[];
}

interface StoredRequest {
  state: {
    today: string;
    past: StoredPast[];
    amount_candidates: Array<{ id: string; text: string; context: string }>;
    date_candidates: Array<{ id: string; iso: string; text: string; context: string }>;
  };
}

export interface ReplyClassification {
  choice: string;
  confidence: number;
}

export interface AskReplyDeps {
  db: DB;
  client: GatewayClient;
  config: Config;
  classify?: (input: {
    question: string;
    options: Array<{ value: string; label: string }>;
    text: string;
    model: string;
  }) => Promise<ReplyClassification>;
  afterAnswer?: (result: AppliedAnswer) => Promise<void>;
}

export interface AppliedAnswer {
  householdId: string;
  letterId: string | null;
  caseId: string | null;
  lane: string | null;
}

export type ReplyOutcome = 'answered' | 'unclear' | 'ignored';

export function stripQuotedText(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const cutoff = lines.findIndex((line, index) => {
    const candidate = `${line.trim()} ${lines[index + 1]?.trim() ?? ''}`.trim();
    return (
      /^(?:On\s+.+\s+wrote:|From:\s|>{1,}|-{2,}\s*Original Message\s*-{2,})/i.test(line.trim()) ||
      /^Vào\s+.+\s+đã\s+viết:/i.test(candidate)
    );
  });
  return (cutoff < 0 ? lines : lines.slice(0, cutoff)).join('\n').trim().slice(0, 500);
}

function askOptions(ask: AskRow): Array<{ value: string; label: string }> {
  return JSON.parse(ask.options_json) as Array<{ value: string; label: string }>;
}

function exactReplyChoice(
  text: string,
  options: Array<{ value: string; label: string }>,
): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const answer = normalize(text.split('\n').find((line) => line.trim()) ?? '');
  if (!answer) return null;
  const matches = options.filter(
    (option) => normalize(option.value) === answer || normalize(option.label) === answer,
  );
  const choices = new Set(matches.map((option) => option.value));
  return choices.size === 1 ? (choices.values().next().value ?? null) : null;
}

function letterById(db: DB, letterId: string): LetterRow {
  const row = db.prepare('SELECT * FROM letters WHERE id = ?').get(letterId) as
    | LetterRow
    | undefined;
  if (!row) throw new Error(`Letter ${letterId} not found`);
  return row;
}

function storedRoute(db: DB, letterId: string): RouteOutput {
  const row = db.prepare('SELECT v FROM kv WHERE k = ?').get(`route:${letterId}`) as
    | { v: string }
    | undefined;
  if (!row) throw new Error(`Missing stored route for ${letterId}`);
  return JSON.parse(row.v) as RouteOutput;
}

function eventTypeFor(action: CaseChange['action'], secondNotice: boolean): string {
  if (action === 'reopen') return 'contradiction';
  if (action === 'paid') return 'paid_signal';
  if (action === 'watch') return 'escalated';
  if (secondNotice) return 'reminder_received';
  return action === 'open' ? 'opened' : 'linked';
}

function routeInputFor(
  db: DB,
  letter: LetterRow,
  forced: NonNullable<RouteInput['forced']>,
): RouteInput {
  const decision = db
    .prepare(
      'SELECT request_json, response_json FROM decisions WHERE letter_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(letter.id) as { request_json: string; response_json: string } | undefined;
  if (!decision) throw new Error(`Missing decision for ${letter.id}`);
  const request = JSON.parse(decision.request_json) as StoredRequest;
  const response = JSON.parse(decision.response_json) as SystemOneResponse;
  const past: RoutePast[] = request.state.past.map((item) => {
    const pastLetter = db
      .prepare('SELECT case_id FROM letters WHERE id = ? AND household_id = ?')
      .get(item.id, letter.household_id) as { case_id: string | null } | undefined;
    const caseRow = pastLetter?.case_id
      ? (getCase(db, letter.household_id, pastLetter.case_id) as
          | { status: RoutePast['caseStatus'] }
          | undefined)
      : undefined;
    return {
      letterId: item.id,
      caseId: pastLetter?.case_id ?? null,
      caseStatus: caseRow?.status ?? item.case_status,
      kind: item.kind,
      lane: item.lane,
      receivedAt: item.received,
      senderOrg: item.sender,
      accountTail: null,
    };
  });
  const quality = JSON.parse(letter.quality_json ?? '{}') as {
    qualityFlagged?: boolean;
    r2Failed?: boolean;
  };
  return {
    letterId: letter.id,
    today: request.state.today,
    senderOrg: letter.sender_org,
    title: letter.title ?? 'Letter',
    qualityFlagged: Boolean(quality.qualityFlagged),
    r2Failed: Boolean(quality.r2Failed),
    scamRuleHits: JSON.parse(letter.scam_rule_hits_json ?? '[]') as string[],
    answers: response.answers as Record<string, RouteAnswer>,
    past,
    amountCandidates: request.state.amount_candidates.flatMap((candidate) => {
      const amountCents = parseUsd(candidate.text);
      return amountCents === null ? [] : [{ id: candidate.id, amountCents }];
    }),
    dateCandidates: request.state.date_candidates.map((candidate) => ({
      id: candidate.id,
      iso: candidate.iso,
    })),
    forced,
  };
}

function replaceChecks(db: DB, letter: LetterRow, checks: RouteCheck[]): void {
  db.prepare('DELETE FROM checks WHERE letter_id = ? AND household_id = ?').run(
    letter.id,
    letter.household_id,
  );
  for (const check of checks) {
    db.prepare(
      `INSERT INTO checks
        (id, letter_id, household_id, key, label, qtype, answer, probability, confidence, threshold, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `chk_${nanoid()}`,
      letter.id,
      letter.household_id,
      check.key,
      check.label,
      check.qtype,
      check.answer,
      check.probability,
      check.confidence,
      check.threshold,
      check.outcome,
    );
  }
}

function commitRoute(
  db: DB,
  letter: LetterRow,
  forced: NonNullable<RouteInput['forced']>,
): AppliedAnswer {
  const output = route(routeInputFor(db, letter, forced));
  let caseId = letter.case_id;
  if (output.caseChange) {
    caseId = saveCaseChange(db, {
      householdId: letter.household_id,
      letterId: letter.id,
      change: { ...output.caseChange, caseId: output.caseChange.caseId ?? letter.case_id },
    });
    addCaseEvent(db, {
      householdId: letter.household_id,
      caseId,
      letterId: letter.id,
      type: eventTypeFor(output.caseChange.action, output.caseChange.secondNotice),
      actor: 'agent',
      detail: { forced: true },
    });
  } else if (forced.linkLetterId) {
    const target = db
      .prepare('SELECT case_id FROM letters WHERE id = ? AND household_id = ?')
      .get(forced.linkLetterId, letter.household_id) as { case_id: string | null } | undefined;
    if (target?.case_id) {
      caseId = target.case_id;
      addCaseEvent(db, {
        householdId: letter.household_id,
        caseId,
        letterId: letter.id,
        type: 'linked',
        actor: 'agent',
        detail: { forced: true },
      });
    }
  }
  db.prepare(
    'UPDATE letters SET lane = ?, kind = ?, amount_cents = ?, due_date = ?, case_id = ?, updated_at = ? WHERE id = ? AND household_id = ?',
  ).run(
    output.lane,
    output.kind,
    output.amountCents,
    output.dueDate,
    caseId,
    new Date().toISOString(),
    letter.id,
    letter.household_id,
  );
  replaceChecks(db, letter, output.checks);
  replaceRelations(db, {
    householdId: letter.household_id,
    letterId: letter.id,
    relations: output.relations,
  });
  db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(
    `route:${letter.id}`,
    JSON.stringify(output),
  );
  return { householdId: letter.household_id, letterId: letter.id, caseId, lane: output.lane };
}

function closeCase(
  db: DB,
  letter: LetterRow,
  caseId: string,
  status: 'paid' | 'closed',
  member?: { id: string; via: 'email' | 'web' },
): AppliedAnswer {
  const caseRow = getCase(db, letter.household_id, caseId);
  if (!caseRow) throw new Error(`Case ${caseId} not found`);
  db.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE id = ? AND household_id = ?').run(
    status,
    new Date().toISOString(),
    caseId,
    letter.household_id,
  );
  const output = storedRoute(db, letter.id);
  const change: CaseChange = {
    caseId,
    title: String(caseRow.title),
    counterparty: String(caseRow.counterparty),
    kind: String(caseRow.kind) as Kind,
    amountCents:
      status === 'paid' || caseRow.amount_cents === null ? null : Number(caseRow.amount_cents),
    dueDate: caseRow.due_date === null ? null : String(caseRow.due_date),
    secondNotice: Boolean(caseRow.second_notice),
    contradiction: Boolean(caseRow.contradiction),
    action: status === 'paid' ? 'paid' : 'update',
    status,
  };
  output.lane = 'handled';
  output.amountCents = null;
  output.caseChange = change;
  output.familyAlert = false;
  output.notes = [
    status === 'paid' ? 'A family member marked this paid.' : 'A family member closed this case.',
  ];
  db.prepare(
    'UPDATE letters SET lane = ?, amount_cents = ?, case_id = ?, updated_at = ? WHERE id = ? AND household_id = ?',
  ).run('handled', null, caseId, new Date().toISOString(), letter.id, letter.household_id);
  db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(
    `route:${letter.id}`,
    JSON.stringify(output),
  );
  db.prepare(
    `UPDATE asks SET status = 'answered', answer_key = ?, answered_by = ?, answered_via = ?, answered_at = ?
      WHERE case_id = ? AND household_id = ? AND status = 'open'`,
  ).run(
    status === 'paid' ? 'paid' : 'closed',
    member?.id ?? null,
    member?.via ?? 'email',
    new Date().toISOString(),
    caseId,
    letter.household_id,
  );
  addCaseEvent(db, {
    householdId: letter.household_id,
    caseId,
    letterId: letter.id,
    type: status === 'paid' ? 'marked_paid' : 'closed',
    actor: 'member',
    memberId: member?.id ?? null,
    detail: { via: member?.via ?? 'email' },
  });
  queueCaseFileSync(db, letter.household_id, caseId);
  return { householdId: letter.household_id, letterId: letter.id, caseId, lane: 'handled' };
}

export function markCasePaidWeb(
  db: DB,
  input: { householdId: string; caseId: string; memberId: string },
): AppliedAnswer | null {
  const letter = db
    .prepare(
      'SELECT * FROM letters WHERE case_id = ? AND household_id = ? ORDER BY received_at DESC, id DESC LIMIT 1',
    )
    .get(input.caseId, input.householdId) as LetterRow | undefined;
  if (!letter) return null;
  return closeCase(db, letter, input.caseId, 'paid', { id: input.memberId, via: 'web' });
}

function ensureAskedEvent(
  db: DB,
  ask: AskRow,
  caseId: string | null,
  letterId: string | null,
): void {
  if (!caseId) return;
  const existing = db
    .prepare(
      "SELECT 1 FROM case_events WHERE case_id = ? AND letter_id IS ? AND type = 'asked' LIMIT 1",
    )
    .get(caseId, letterId);
  if (existing) return;
  addCaseEvent(db, {
    householdId: ask.household_id,
    caseId,
    letterId,
    type: 'asked',
    actor: 'agent',
    detail: { askId: ask.id, qtype: ask.qtype },
  });
}

export function applyAskAnswer(
  db: DB,
  input: { askId: string; memberId: string; answer: string; via: 'email' | 'web' },
): AppliedAnswer | null {
  return db.transaction(() => {
    const ask = db.prepare('SELECT * FROM asks WHERE id = ?').get(input.askId) as
      | AskRow
      | undefined;
    if (ask?.status !== 'open') return null;
    const member = db
      .prepare('SELECT household_id, role FROM members WHERE id = ?')
      .get(input.memberId) as { household_id: string; role: string } | undefined;
    if (member?.role !== 'family' || member.household_id !== ask.household_id) return null;
    const options = askOptions(ask);
    if (!options.some((option) => option.value === input.answer)) return null;
    const letter = ask.letter_id ? letterById(db, ask.letter_id) : null;
    let result: AppliedAnswer = {
      householdId: ask.household_id,
      letterId: letter?.id ?? null,
      caseId: ask.case_id,
      lane: letter?.lane ?? null,
    };

    if (ask.qtype === 'link' && letter) {
      const askedRelation = db
        .prepare(
          "SELECT * FROM relations WHERE letter_id = ? AND household_id = ? AND relation = 'same_matter' AND status = 'asked' ORDER BY created_at DESC LIMIT 1",
        )
        .get(letter.id, letter.household_id) as
        | { other_letter_id: string; probability: number }
        | undefined;
      if (askedRelation) {
        if (input.answer === 'yes') {
          result = commitRoute(db, letter, { linkLetterId: askedRelation.other_letter_id });
        } else {
          result = commitRoute(db, letter, { rejectLinkLetterId: askedRelation.other_letter_id });
          saveRelations(db, {
            householdId: letter.household_id,
            letterId: letter.id,
            relations: [
              {
                otherLetterId: askedRelation.other_letter_id,
                relation: 'same_matter',
                probability: askedRelation.probability,
                status: 'rejected',
              },
            ],
          });
        }
      }
    } else if (ask.qtype === 'paid' && letter) {
      const caseId = letter.case_id ?? ask.case_id;
      if (caseId && input.answer === 'paid')
        result = closeCase(db, letter, caseId, 'paid', { id: input.memberId, via: input.via });
      if (caseId && input.answer === 'not_ours')
        result = closeCase(db, letter, caseId, 'closed', { id: input.memberId, via: input.via });
    } else if ((ask.qtype === 'scam' || ask.qtype === 'check') && letter) {
      if (input.answer === 'scam') result = commitRoute(db, letter, { scam: true });
      if (input.answer === 'real') result = commitRoute(db, letter, { scam: false });
      if (input.answer === 'handled_it' || input.answer === 'not_ours') {
        const caseId = letter.case_id ?? ask.case_id;
        if (caseId)
          result = closeCase(db, letter, caseId, 'closed', {
            id: input.memberId,
            via: input.via,
          });
        else {
          result = {
            householdId: letter.household_id,
            letterId: letter.id,
            caseId: null,
            lane: 'handled',
          };
          db.prepare('UPDATE letters SET lane = ?, amount_cents = NULL WHERE id = ?').run(
            'handled',
            letter.id,
          );
        }
      }
    } else if (ask.qtype === 'kind' && letter) {
      if (KINDS.includes(input.answer as Kind)) {
        result = commitRoute(db, letter, { kind: input.answer as Kind });
      }
    }

    ensureAskedEvent(db, ask, result.caseId, result.letterId);
    if (result.caseId) {
      addCaseEvent(db, {
        householdId: ask.household_id,
        caseId: result.caseId,
        letterId: result.letterId,
        type: 'answered',
        actor: 'member',
        memberId: input.memberId,
        detail: { askId: ask.id, qtype: ask.qtype, answer: input.answer, via: input.via },
      });
    }
    db.prepare(
      "UPDATE asks SET status = 'answered', answer_key = ?, answered_by = ?, answered_via = ?, answered_at = ? WHERE id = ?",
    ).run(input.answer, input.memberId, input.via, new Date().toISOString(), ask.id);
    if (result.caseId) queueCaseFileSync(db, result.householdId, result.caseId);
    return result;
  })();
}

async function classifyReply(
  client: GatewayClient,
  input: {
    question: string;
    options: Array<{ value: string; label: string }>;
    text: string;
    model: string;
  },
): Promise<ReplyClassification> {
  const response = await systemOne(client, {
    model: input.model,
    state: { question: input.question, reply: input.text },
    questions: {
      answer: {
        type: 'choice',
        instructions: 'What does the reply say about the question?',
        criteria: {
          ...Object.fromEntries(input.options.map((option) => [option.value, option.label])),
          unclear: 'The reply does not clearly choose one of the offered answers',
        },
      },
    },
  });
  const answer = response.answers.answer;
  if (answer?.type !== 'choice') return { choice: 'unclear', confidence: 0 };
  return { choice: answer.choice, confidence: answer.confidence };
}

function suppressionReason(letter: LetterRow | null): string | null {
  if (!letter) return null;
  if (letter.trial || letter.source === 'seed' || letter.source === 'sample') return 'trial';
  return letter.source === 'eval' ? 'eval' : null;
}

function queueOutbox(
  db: DB,
  input: {
    householdId: string;
    to: string;
    kind: 'ask' | 'parent_note' | 'family_alert';
    subject: string;
    body: string;
    relatedId: string;
    suppressedReason: string | null;
    threadId: string | null;
    replyMessageId?: string | null;
  },
): void {
  const existing = db
    .prepare(
      'SELECT 1 FROM outbox WHERE household_id = ? AND kind = ? AND to_email = ? AND related_id = ?',
    )
    .get(input.householdId, input.kind, input.to, input.relatedId);
  if (existing) return;
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status, suppressed_reason,
       agentmail_message_id, agentmail_thread_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `out_${nanoid()}`,
    input.householdId,
    input.to,
    input.kind,
    input.subject.replace(/[\r\n]+/g, ' ').trim(),
    input.body,
    input.relatedId,
    input.suppressedReason ? 'suppressed' : 'pending',
    input.suppressedReason,
    input.replyMessageId ?? null,
    input.threadId,
    new Date().toISOString(),
  );
}

function queueClarification(deps: AskReplyDeps, ask: AskRow): void {
  const letter = ask.letter_id ? letterById(deps.db, ask.letter_id) : null;
  const family = deps.db
    .prepare("SELECT email FROM members WHERE household_id = ? AND role = 'family'")
    .all(ask.household_id) as Array<{ email: string }>;
  const original = deps.db
    .prepare(
      `SELECT agentmail_message_id FROM outbox
        WHERE household_id = ? AND related_id = ? AND kind = 'ask' AND status = 'sent'
          AND agentmail_message_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(ask.household_id, ask.id) as { agentmail_message_id: string } | undefined;
  const link = `${deps.config.MAILKEEP_PUBLIC_URL.replace(/\/$/, '')}/letters/${ask.letter_id ?? ''}`;
  for (const member of family) {
    queueOutbox(deps.db, {
      householdId: ask.household_id,
      to: member.email,
      kind: 'ask',
      subject: `Re: ${ask.question}`,
      body: `I didn't catch that. Tap here to answer: ${link}`,
      relatedId: `${ask.id}:clarify`,
      suppressedReason: suppressionReason(letter),
      threadId: ask.agentmail_thread_id,
      replyMessageId: original?.agentmail_message_id ?? null,
    });
  }
}

export function queueScamWarning(deps: AskReplyDeps, result: AppliedAnswer): void {
  if (!result.letterId || result.lane !== 'careful') return;
  const letter = letterById(deps.db, result.letterId);
  const output = storedRoute(deps.db, letter.id);
  const household = deps.db
    .prepare('SELECT parent_display FROM households WHERE id = ?')
    .get(letter.household_id) as { parent_display: string };
  const members = deps.db
    .prepare('SELECT email, role FROM members WHERE household_id = ?')
    .all(letter.household_id) as Array<{ email: string; role: 'parent' | 'family' }>;
  const link = `${deps.config.MAILKEEP_PUBLIC_URL.replace(/\/$/, '')}/letters/${letter.id}`;
  const suppressedReason = suppressionReason(letter);
  for (const member of members) {
    if (member.role === 'parent') {
      const note = parentNote({
        parentDisplay: household.parent_display,
        title: letter.title ?? 'Letter',
        senderOrg: letter.sender_org,
        summaryParent: letter.summary_parent ?? '',
        amountCents: null,
        dueDate: null,
        route: output,
      });
      queueOutbox(deps.db, {
        householdId: letter.household_id,
        to: member.email,
        kind: 'parent_note',
        subject: note.subject,
        body: note.body,
        relatedId: `${letter.id}:answer-scam`,
        suppressedReason,
        threadId: null,
      });
    } else {
      const alert = familyAlert({
        parentDisplay: household.parent_display,
        title: letter.title ?? 'Letter',
        route: output,
        checks: [],
        link,
      });
      queueOutbox(deps.db, {
        householdId: letter.household_id,
        to: member.email,
        kind: 'family_alert',
        subject: alert.subject,
        body: alert.body,
        relatedId: `${letter.id}:answer-scam`,
        suppressedReason,
        threadId: null,
      });
    }
  }
}

export async function syncCaseFileForLetter(
  deps: AskReplyDeps,
  result: AppliedAnswer,
): Promise<void> {
  if (!result.caseId) return;
  const models = deps.db
    .prepare('SELECT model_id FROM decisions WHERE letter_id = ?')
    .all(result.letterId ?? '') as Array<{ model_id: string }>;
  await updateCaseFile(deps.client, deps.db, {
    householdId: result.householdId,
    caseId: result.caseId,
    modelIds: [deps.config.MAILKEEP_OLLAMA_MODEL, ...models.map((model) => model.model_id)],
  });
}

export async function handleAlertReply(
  deps: AskReplyDeps,
  input: { alertId: string; memberId: string; text: string; via: 'email' | 'web' },
): Promise<ReplyOutcome> {
  const alert = deps.db.prepare('SELECT * FROM outbox WHERE id = ?').get(input.alertId) as
    | ({ id: string; household_id: string; related_id: string | null } & {
        kind: string;
        status: string;
      })
    | undefined;
  if (alert?.kind !== 'family_alert' || alert.status !== 'sent' || !alert.related_id)
    return 'ignored';
  const member = deps.db
    .prepare('SELECT household_id, role FROM members WHERE id = ?')
    .get(input.memberId) as { household_id: string; role: string } | undefined;
  if (member?.role !== 'family' || member.household_id !== alert.household_id) return 'ignored';
  if (!/^paid[.!]?$/i.test(stripQuotedText(input.text))) return 'unclear';
  const letter = letterById(deps.db, alert.related_id);
  if (letter.household_id !== alert.household_id || !letter.case_id) return 'ignored';
  const caseId = letter.case_id;
  const caseRow = getCase(deps.db, letter.household_id, caseId);
  if (
    !caseRow ||
    !Number(caseRow.second_notice) ||
    !['open', 'overdue'].includes(String(caseRow.status))
  )
    return 'ignored';
  const result = deps.db.transaction(() =>
    closeCase(deps.db, letter, caseId, 'paid', { id: input.memberId, via: input.via }),
  )();
  if (deps.afterAnswer) await deps.afterAnswer(result);
  return 'answered';
}

export async function handleAskReply(
  deps: AskReplyDeps,
  input: { askId: string; memberId: string; text: string; via: 'email' | 'web' },
): Promise<ReplyOutcome> {
  const ask = deps.db.prepare('SELECT * FROM asks WHERE id = ?').get(input.askId) as
    | AskRow
    | undefined;
  if (ask?.status !== 'open') return 'ignored';
  const member = deps.db
    .prepare('SELECT household_id, role FROM members WHERE id = ?')
    .get(input.memberId) as { household_id: string; role: string } | undefined;
  if (member?.role !== 'family' || member.household_id !== ask.household_id) return 'ignored';
  const text = stripQuotedText(input.text);
  const options = askOptions(ask);
  const exact = exactReplyChoice(text, options);
  const classification = exact
    ? { choice: exact, confidence: 1 }
    : deps.classify
      ? await deps.classify({
          question: ask.question,
          options,
          text,
          model: deps.config.MAILKEEP_JEV_MODEL,
        })
      : await classifyReply(deps.client, {
          question: ask.question,
          options,
          text,
          model: deps.config.MAILKEEP_JEV_MODEL,
        });
  if (
    classification.confidence < REPLY_CONFIDENCE ||
    classification.choice === 'unclear' ||
    !options.some((option) => option.value === classification.choice)
  ) {
    queueClarification(deps, ask);
    return 'unclear';
  }
  const result = applyAskAnswer(deps.db, {
    askId: ask.id,
    memberId: input.memberId,
    answer: classification.choice,
    via: input.via,
  });
  if (!result) return 'ignored';
  if (deps.afterAnswer) {
    await deps.afterAnswer(result);
  } else {
    queueScamWarning(deps, result);
  }
  return 'answered';
}
