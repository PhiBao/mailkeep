import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { fileLetter } from '../act/box.js';
import { remember } from '../act/memory.js';
import { queueLetterOutbox, queueRetake } from '../act/outbox.js';
import { addCaseEvent, saveCaseChange, saveRelations } from '../cases/repo.js';
import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import { embed } from '../providers/pinecone.js';
import { withTaskHold } from '../sprite/tasks.js';
import { todayIso } from '../util/clock.js';
import { log } from '../util/log.js';
import { formatUsd } from '../util/money.js';
import { decide } from './decide.js';
import { extractPdf } from './pdf.js';
import type { DecisionPast } from './questions.js';
import { readLetterImage, readLetterText } from './read.js';
import { embedText, type RecallLetter, recall } from './recall.js';
import {
  type RouteAsk,
  type RouteCheck,
  type RouteOutput,
  type RoutePast,
  route,
} from './route.js';

export interface PipelineDeps {
  client: GatewayClient;
  config: Config;
  db: DB;
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
  claims_government: number;
  phones_json: string | null;
  title: string | null;
  summary_parent: string | null;
  todo_parent: string | null;
  kind: string | null;
  lane: 'handled' | 'headsup' | 'needs_you' | 'careful' | null;
  amount_cents: number | null;
  due_date: string | null;
  account_tail: string | null;
  case_id: string | null;
  box_file_id: string | null;
}

function letterRow(db: DB, letterId: string): LetterRow {
  const row = db.prepare('SELECT * FROM letters WHERE id = ?').get(letterId) as
    | LetterRow
    | undefined;
  if (!row) throw new Error(`Letter ${letterId} not found`);
  return row;
}

function setStatus(db: DB, letterId: string, status: string, error: string | null = null): void {
  db.prepare('UPDATE letters SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(
    status,
    error,
    new Date().toISOString(),
    letterId,
  );
}

function recallLetter(row: LetterRow): RecallLetter {
  return {
    id: row.id,
    household_id: row.household_id,
    received_at: row.received_at,
    trial: row.trial,
    sender_org: row.sender_org,
    title: row.title,
    transcript: row.transcript,
    account_tail: row.account_tail,
    kind: row.kind,
    lane: row.lane,
    case_id: row.case_id,
    amount_cents: row.amount_cents,
    due_date: row.due_date,
    phones_json: row.phones_json,
  };
}

function money(cents: number | null): string | null {
  return cents === null ? null : formatUsd(cents);
}

async function readLetter(deps: PipelineDeps, row: LetterRow, today: string) {
  const bytes = await readFile(row.local_path);
  if (row.mime !== 'application/pdf') {
    return readLetterImage(deps.client, { bytes, model: deps.config.MAILKEEP_OLLAMA_MODEL, today });
  }
  const workDir = path.join(deps.config.MAILKEEP_DATA_DIR, 'work', row.id);
  const pdf = await extractPdf(row.local_path, workDir);
  if (pdf.text.length >= 200) {
    return readLetterText(deps.client, {
      text: pdf.text,
      model: deps.config.MAILKEEP_OLLAMA_MODEL,
      today,
    });
  }
  const image = await readFile(pdf.images[0] ?? '');
  return readLetterImage(deps.client, {
    bytes: image,
    model: deps.config.MAILKEEP_OLLAMA_MODEL,
    today,
  });
}

function saveChecks(
  db: DB,
  input: { householdId: string; letterId: string; checks: RouteCheck[] },
): void {
  for (const check of input.checks) {
    db.prepare(
      `INSERT INTO checks
        (id, letter_id, household_id, key, label, qtype, answer, probability, confidence, threshold, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `chk_${nanoid()}`,
      input.letterId,
      input.householdId,
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

function saveAsks(
  db: DB,
  input: { householdId: string; letterId: string; caseId: string | null; asks: RouteAsk[] },
): Array<RouteAsk & { id: string }> {
  return input.asks.map((ask) => {
    const askId = `ask_${nanoid()}`;
    db.prepare(
      `INSERT INTO asks
        (id, household_id, letter_id, case_id, qtype, question, evidence, options_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(
      askId,
      input.householdId,
      input.letterId,
      input.caseId,
      ask.qtype,
      ask.question,
      ask.evidence,
      JSON.stringify(ask.options),
      new Date().toISOString(),
    );
    if (input.caseId) {
      addCaseEvent(db, {
        householdId: input.householdId,
        caseId: input.caseId,
        letterId: input.letterId,
        type: 'asked',
        actor: 'agent',
        detail: { askId, qtype: ask.qtype },
      });
    }
    return { ...ask, id: askId };
  });
}

function queueFailure(deps: PipelineDeps, row: LetterRow, message: string): void {
  if (row.trial || row.source === 'seed' || row.source === 'sample' || row.source === 'eval')
    return;
  const family = deps.db
    .prepare("SELECT email FROM members WHERE household_id = ? AND role = 'family'")
    .all(row.household_id) as Array<{ email: string }>;
  for (const member of family) {
    deps.db
      .prepare(
        `INSERT INTO outbox (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
       VALUES (?, ?, ?, 'family_alert', ?, ?, ?, 'pending', ?)`,
      )
      .run(
        `out_${nanoid()}`,
        row.household_id,
        member.email,
        `Mailkeep couldn't finish: ${row.title ?? 'a letter'}`,
        `Mailkeep couldn't finish this letter. ${message}`,
        row.id,
        new Date().toISOString(),
      );
  }
}

async function actLetter(
  deps: PipelineDeps,
  row: LetterRow,
  output: RouteOutput,
  options: { box?: boolean; email?: boolean } = {},
): Promise<void> {
  const persisted = deps.db.prepare('SELECT v FROM kv WHERE k = ?').get(`acted:${row.id}`);
  if (!persisted) {
    deps.db.transaction(() => {
      let caseId = row.case_id;
      if (output.caseChange) {
        caseId = saveCaseChange(deps.db, {
          householdId: row.household_id,
          letterId: row.id,
          change: output.caseChange,
        });
        deps.db.prepare('UPDATE letters SET case_id = ? WHERE id = ?').run(caseId, row.id);
        const eventType =
          output.caseChange.action === 'reopen'
            ? 'contradiction'
            : output.caseChange.action === 'paid'
              ? 'paid_signal'
              : output.caseChange.action === 'watch'
                ? 'escalated'
                : output.caseChange.secondNotice
                  ? 'reminder_received'
                  : output.caseChange.action === 'open'
                    ? 'opened'
                    : 'linked';
        addCaseEvent(deps.db, {
          householdId: row.household_id,
          caseId,
          letterId: row.id,
          type: eventType,
          actor: 'agent',
          detail: { lane: output.lane },
        });
      }
      saveRelations(deps.db, {
        householdId: row.household_id,
        letterId: row.id,
        relations: output.relations,
      });
      saveChecks(deps.db, {
        householdId: row.household_id,
        letterId: row.id,
        checks: output.checks,
      });
      const asks = saveAsks(deps.db, {
        householdId: row.household_id,
        letterId: row.id,
        caseId,
        asks: output.asks,
      });
      const members = deps.db
        .prepare('SELECT email, display_name, role FROM members WHERE household_id = ?')
        .all(row.household_id) as Array<{
        email: string;
        display_name: string;
        role: 'parent' | 'family';
      }>;
      const household = deps.db
        .prepare('SELECT parent_display FROM households WHERE id = ?')
        .get(row.household_id) as { parent_display: string };
      if (options.email !== false) {
        queueLetterOutbox(deps.db, {
          householdId: row.household_id,
          parentDisplay: household.parent_display,
          publicUrl: deps.config.MAILKEEP_PUBLIC_URL,
          source: row.source,
          trial: Boolean(row.trial),
          letter: {
            id: row.id,
            title: row.title ?? 'Letter',
            summary_parent: row.summary_parent,
            todo_parent: row.todo_parent,
            sender_org: row.sender_org,
            amount_cents: output.amountCents,
            due_date: output.dueDate,
          },
          route: output,
          checks: output.checks,
          asks,
          members,
        });
      }
      deps.db
        .prepare("INSERT INTO kv (k, v) VALUES (?, '1') ON CONFLICT(k) DO UPDATE SET v = '1'")
        .run(`acted:${row.id}`);
    })();
  }

  const current = letterRow(deps.db, row.id);
  const household = deps.db
    .prepare('SELECT pinecone_namespace FROM households WHERE id = ?')
    .get(row.household_id) as { pinecone_namespace: string };
  const vector = await embed(deps.client, {
    text: embedText(recallLetter(current)),
    inputType: 'passage',
  });
  await remember(deps.client, {
    index: deps.config.MAILKEEP_PINECONE_INDEX,
    namespace: household.pinecone_namespace,
    letter: {
      id: current.id,
      vector,
      caseId: current.case_id,
      senderOrg: current.sender_org,
      accountTail: current.account_tail,
      receivedAt: current.received_at,
      kind: current.kind,
      lane: current.lane,
      trial: Boolean(current.trial),
    },
  });
  const modelRows = deps.db
    .prepare('SELECT model_id FROM decisions WHERE letter_id = ?')
    .all(row.id) as Array<{ model_id: string }>;
  if (options.box !== false) {
    await fileLetter(deps.client, deps.db, {
      householdId: row.household_id,
      letter: current,
      route: output,
      caseId: current.case_id,
      caseChange: output.caseChange,
      checks: output.checks,
      modelIds: [deps.config.MAILKEEP_OLLAMA_MODEL, ...modelRows.map((model) => model.model_id)],
    });
  }
}

export async function runLetter(
  deps: PipelineDeps,
  letterId: string,
  options: { box?: boolean; email?: boolean } = {},
): Promise<void> {
  const initial = letterRow(deps.db, letterId);
  if (initial.status === 'done') return;
  await withTaskHold(`letter-${letterId}`, async () => {
    let row = letterRow(deps.db, letterId);
    try {
      if (row.status !== 'acting') {
        const household = deps.db
          .prepare('SELECT * FROM households WHERE id = ?')
          .get(row.household_id) as {
          clock_offset_days: number;
          timezone: string;
          pinecone_namespace: string;
        };
        const today = todayIso(household);
        setStatus(deps.db, row.id, 'reading');
        const read = await readLetter(deps, row, today);
        deps.db
          .prepare(
            `UPDATE letters SET transcript = ?, sender_org = ?, claims_government = ?, title = ?,
            summary_parent = ?, todo_parent = ?, account_tail = ?, phones_json = ?, scam_rule_hits_json = ?,
            quality_json = ?, ollama_in_tokens = ?, ollama_out_tokens = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            read.transcript,
            read.senderOrg,
            read.claimsGovernment ? 1 : 0,
            read.title,
            read.summaryParent,
            read.todoParent,
            read.accountTail,
            JSON.stringify(read.phones.map((phone) => phone.text)),
            JSON.stringify(read.scamRuleHits),
            JSON.stringify({
              qualityFlagged: read.qualityFlagged,
              needsRetake: read.needsRetake,
              r2Failed: read.r2Failed,
            }),
            read.promptTokens,
            read.outputTokens,
            new Date().toISOString(),
            row.id,
          );
        row = letterRow(deps.db, row.id);
        if (read.needsRetake) {
          const askId = `ask_${nanoid()}`;
          deps.db
            .prepare(
              `INSERT INTO asks (id, household_id, letter_id, qtype, question, evidence, options_json, status, created_at)
             VALUES (?, ?, ?, 'retake', 'Please take another photo', 'The photo was too dark or blurry to read', '[]', 'open', ?)`,
            )
            .run(askId, row.household_id, row.id, new Date().toISOString());
          const parent = deps.db
            .prepare("SELECT email FROM members WHERE household_id = ? AND role = 'parent'")
            .get(row.household_id) as { email: string } | undefined;
          if (parent)
            queueRetake(deps.db, {
              householdId: row.household_id,
              letterId: row.id,
              to: parent.email,
              suppressedReason: row.trial ? 'trial' : null,
            });
          setStatus(deps.db, row.id, 'needs_retake');
          return;
        }

        setStatus(deps.db, row.id, 'recalling');
        const candidates = await recall(deps.client, deps.db, {
          householdId: row.household_id,
          namespace: household.pinecone_namespace,
          index: deps.config.MAILKEEP_PINECONE_INDEX,
          letter: recallLetter(row),
        });
        const past: DecisionPast[] = [];
        const routePast: RoutePast[] = [];
        for (const candidate of candidates) {
          const letter = candidate.letter;
          const caseRow = letter.case_id
            ? (deps.db
                .prepare('SELECT status FROM cases WHERE id = ? AND household_id = ?')
                .get(letter.case_id, row.household_id) as { status: string } | undefined)
            : undefined;
          past.push({
            id: letter.id,
            received: letter.received_at,
            sender: letter.sender_org,
            kind: letter.kind as DecisionPast['kind'],
            caseStatus: caseRow?.status ?? 'open',
            amount: money(letter.amount_cents ?? null),
            due: letter.due_date,
            lane: letter.lane,
            text: letter.transcript ?? '',
            phones: JSON.parse(letter.phones_json ?? '[]') as string[],
          });
          routePast.push({
            letterId: letter.id,
            caseId: letter.case_id,
            caseStatus: (caseRow?.status ?? 'open') as RoutePast['caseStatus'],
            kind: letter.kind as RoutePast['kind'],
            lane: letter.lane,
            receivedAt: letter.received_at,
            senderOrg: letter.sender_org,
            accountTail: letter.account_tail,
          });
        }

        setStatus(deps.db, row.id, 'deciding');
        const decision = await decide(deps.client, deps.db, {
          letterId: row.id,
          householdId: row.household_id,
          model: deps.config.MAILKEEP_JEV_MODEL,
          today,
          new: {
            sender: row.sender_org,
            claimsGovernment: Boolean(row.claims_government),
            text: row.transcript ?? '',
            phones: JSON.parse(row.phones_json ?? '[]') as string[],
          },
          past,
          amountCandidates: read.amounts.map((candidate) => ({
            id: candidate.id,
            text: candidate.text,
            context: candidate.context,
          })),
          dateCandidates: read.dates.map((candidate) => ({
            id: candidate.id,
            iso: candidate.iso,
            text: candidate.text,
            context: candidate.context,
          })),
        });
        const output = route({
          letterId: row.id,
          today,
          senderOrg: row.sender_org,
          title: row.title ?? 'Letter',
          qualityFlagged: read.qualityFlagged,
          r2Failed: read.r2Failed,
          scamRuleHits: read.scamRuleHits,
          answers: decision.response.answers,
          past: routePast,
          amountCandidates: read.amounts.map((candidate) => ({
            id: candidate.id,
            amountCents: candidate.amountCents,
          })),
          dateCandidates: read.dates.map((candidate) => ({ id: candidate.id, iso: candidate.iso })),
        });
        const cost = Math.round(
          decision.response.usage.input_tokens * 0.042 +
            read.promptTokens * 0.14 +
            read.outputTokens * 0.4,
        );
        deps.db
          .prepare(
            `UPDATE letters SET lane = ?, kind = ?, amount_cents = ?, due_date = ?, jev_tokens = ?, cost_microusd = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            output.lane,
            output.kind,
            output.amountCents,
            output.dueDate,
            decision.response.usage.input_tokens,
            cost,
            new Date().toISOString(),
            row.id,
          );
        deps.db
          .prepare(
            'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
          )
          .run(`route:${row.id}`, JSON.stringify(output));
        setStatus(deps.db, row.id, 'acting');
        row = letterRow(deps.db, row.id);
      }

      const routeValue = deps.db.prepare('SELECT v FROM kv WHERE k = ?').get(`route:${row.id}`) as
        | { v: string }
        | undefined;
      if (!routeValue) throw new Error('Missing stored route for acting letter');
      await actLetter(deps, row, JSON.parse(routeValue.v) as RouteOutput, options);
      setStatus(deps.db, row.id, 'done');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ event: 'letter_failed', letterId, status: row.status }, message);
      if (row.status === 'acting') {
        setStatus(deps.db, row.id, 'acting', message.slice(0, 500));
      } else {
        setStatus(deps.db, row.id, 'failed', message.slice(0, 500));
        queueFailure(deps, row, message.slice(0, 300));
      }
      throw error;
    }
  });
}
