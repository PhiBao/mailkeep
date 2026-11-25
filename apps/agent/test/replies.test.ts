import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';
import { GatewayClient } from '../src/gateway/client.js';
import {
  type AskReplyDeps,
  applyAskAnswer,
  handleAlertReply,
  handleAskReply,
  stripQuotedText,
} from '../src/notify/replies.js';
import { type RouteAnswer, type RouteInput, route } from '../src/pipeline/route.js';

let directory: string;
let db: DB;
let familyId: string;
let parentId: string;

const pastId = 'ltr_past';
const letterId = 'ltr_new';
const pastCaseId = 'case_past';
const newCaseId = 'case_new';

function answers(overrides: Record<string, RouteAnswer> = {}): Record<string, RouteAnswer> {
  return {
    kind: {
      type: 'choice',
      choice: 'bill',
      confidence: 0.95,
      probabilities: { bill: 0.95, other: 0.05 },
    },
    needs_action: { type: 'noul', noul: 0.9 },
    scam_payment: { type: 'noul', noul: 0.01 },
    scam_pressure: { type: 'noul', noul: 0.01 },
    scam_secrecy: { type: 'noul', noul: 0.01 },
    scam_prize_fee: { type: 'noul', noul: 0.01 },
    amount_due: {
      type: 'choice',
      choice: 'a0',
      confidence: 0.95,
      probabilities: { a0: 0.95, none: 0.05 },
    },
    due_date: {
      type: 'choice',
      choice: 'd0',
      confidence: 0.95,
      probabilities: { d0: 0.95, none: 0.05 },
    },
    same_matter_0: { type: 'noul', noul: 0.6 },
    follow_up_0: { type: 'noul', noul: 0.1 },
    completes_0: { type: 'noul', noul: 0.1 },
    sender_consistent_0: { type: 'noul', noul: 0.95 },
    ...overrides,
  };
}

function routeInput(answerOverrides: Record<string, RouteAnswer> = {}): RouteInput {
  return {
    letterId,
    today: '2026-12-09',
    senderOrg: 'Riverbend Water Utility',
    title: 'Water bill',
    qualityFlagged: false,
    r2Failed: false,
    scamRuleHits: [],
    answers: answers(answerOverrides),
    past: [
      {
        letterId: pastId,
        caseId: pastCaseId,
        caseStatus: 'open',
        kind: 'bill',
        lane: 'headsup',
        receivedAt: '2026-11-18T00:00:00Z',
        senderOrg: 'Riverbend Water Utility',
        accountTail: null,
      },
    ],
    amountCandidates: [{ id: 'a0', amountCents: 10000 }],
    dateCandidates: [{ id: 'd0', iso: '2026-12-20' }],
  };
}

function insertLetter(input: {
  id: string;
  caseId?: string | null;
  lane?: string | null;
  kind?: string | null;
  title?: string;
}): void {
  const now = '2026-11-24T12:00:00.000Z';
  db.prepare(
    `INSERT INTO letters
      (id, household_id, source, trial, received_at, status, mime, sha256, local_path,
       title, sender_org, transcript, phones_json, quality_json, scam_rule_hits_json,
       lane, kind, amount_cents, due_date, case_id, summary_parent, created_at, updated_at)
     VALUES (?, 'hh_test', 'upload', 0, ?, 'done', 'image/jpeg', ?, ?, ?, ?, ?, '[]', '{}', '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.id === pastId ? '2026-11-18T12:00:00.000Z' : '2026-12-09T12:00:00.000Z',
    `sha_${input.id}`,
    `/tmp/${input.id}.jpg`,
    input.title ?? 'Water bill',
    'Riverbend Water Utility',
    'Water bill for $100.00 due December 20, 2026.',
    input.lane ?? null,
    input.kind ?? null,
    input.id === pastId ? 10000 : null,
    input.id === pastId ? '2026-12-20' : null,
    input.caseId ?? null,
    'A water bill is due.',
    now,
    now,
  );
}

function seedDecision(answerOverrides: Record<string, RouteAnswer> = {}): void {
  const request = {
    state: {
      today: '2026-12-09',
      past: [
        {
          id: pastId,
          received: '2026-11-18',
          sender: 'Riverbend Water Utility',
          kind: 'bill',
          case_status: 'open',
          amount: '$100.00',
          due: '2026-12-20',
          lane: 'headsup',
          text: 'Water bill for $100.00 due December 20, 2026.',
          phones: [],
        },
      ],
      amount_candidates: [{ id: 'a0', text: '$100.00', context: 'Amount due $100.00' }],
      date_candidates: [
        { id: 'd0', iso: '2026-12-20', text: 'December 20, 2026', context: 'Due December 20' },
      ],
    },
  };
  const response = {
    model: 'jev-1.14.0',
    answers: answers(answerOverrides),
    usage: { input_tokens: 100, output_tokens: 20 },
  };
  db.prepare('DELETE FROM decisions WHERE id = ?').run('dec_new');
  db.prepare(
    `INSERT INTO decisions
      (id, letter_id, household_id, model_id, request_json, response_json, latency_ms, created_at)
     VALUES ('dec_new', ?, 'hh_test', 'jev-1.14.0', ?, ?, 100, ?)`,
  ).run(letterId, JSON.stringify(request), JSON.stringify(response), new Date().toISOString());
  const output = route(routeInput(answerOverrides));
  db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(
    `route:${letterId}`,
    JSON.stringify(output),
  );
  db.prepare(
    'UPDATE letters SET lane = ?, kind = ?, amount_cents = ?, due_date = ? WHERE id = ?',
  ).run(output.lane, output.kind, output.amountCents, output.dueDate, letterId);
}

function seedAsk(
  qtype: 'link' | 'paid' | 'scam' | 'kind' | 'check',
  options: Array<{ value: string; label: string }>,
  caseId: string | null = newCaseId,
): string {
  const askId = `ask_${qtype}`;
  db.prepare(
    `INSERT INTO asks
      (id, household_id, letter_id, case_id, qtype, question, evidence, options_json, status,
       agentmail_thread_id, created_at)
     VALUES (?, 'hh_test', ?, ?, ?, 'What happened?', 'Evidence', ?, 'open', 'thread_1', ?)`,
  ).run(askId, letterId, caseId, qtype, JSON.stringify(options), new Date().toISOString());
  if (qtype === 'link') {
    db.prepare(
      `INSERT INTO relations
        (id, household_id, letter_id, other_letter_id, relation, probability, status, created_at)
       VALUES ('rel_asked', 'hh_test', ?, ?, 'same_matter', 0.6, 'asked', ?)`,
    ).run(letterId, pastId, new Date().toISOString());
  }
  return askId;
}

function seedAlert(secondNotice = true): string {
  db.prepare('DELETE FROM outbox WHERE id = ?').run('out_alert');
  db.prepare('UPDATE cases SET second_notice = ? WHERE id = ?').run(
    secondNotice ? 1 : 0,
    newCaseId,
  );
  db.prepare('UPDATE letters SET case_id = ? WHERE id = ?').run(newCaseId, letterId);
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status,
       agentmail_thread_id, created_at)
     VALUES ('out_alert', 'hh_test', 'kiter7396@gmail.com', 'family_alert', 'Second notice',
       'Reply PAID', ?, 'sent', 'thread_alert', ?)`,
  ).run(letterId, new Date().toISOString());
  return 'out_alert';
}

function deps(): AskReplyDeps {
  const config = loadConfig({
    MAILKEEP_DATA_DIR: directory,
    MAILKEEP_PUBLIC_URL: 'https://mailkeep.example',
  });
  return { db, client: new GatewayClient({ config }), config };
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-replies-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  createHousehold(db, {
    id: 'hh_test',
    name: 'Test',
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    demo: false,
  });
  parentId = addMember(db, {
    householdId: 'hh_test',
    email: 'kiter7396+mom@gmail.com',
    displayName: 'Ruth',
    role: 'parent',
  }).id;
  familyId = addMember(db, {
    householdId: 'hh_test',
    email: 'kiter7396@gmail.com',
    displayName: 'Sarah',
    role: 'family',
  }).id;
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, amount_cents, due_date,
       second_notice, contradiction, created_at, updated_at)
     VALUES (?, 'hh_test', 'Water bill', 'Riverbend Water Utility', 'bill', 'open', 10000,
       '2026-12-20', 0, 0, ?, ?)`,
  ).run(pastCaseId, new Date().toISOString(), new Date().toISOString());
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, amount_cents, due_date,
       second_notice, contradiction, created_at, updated_at)
     VALUES (?, 'hh_test', 'New water bill', 'Riverbend Water Utility', 'bill', 'open', 10000,
       '2026-12-20', 0, 0, ?, ?)`,
  ).run(newCaseId, new Date().toISOString(), new Date().toISOString());
  insertLetter({ id: pastId, caseId: pastCaseId, lane: 'headsup', kind: 'bill' });
  insertLetter({ id: letterId, caseId: newCaseId, lane: 'headsup', kind: 'bill' });
  seedDecision();
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('reply quote stripping', () => {
  it.each([
    ['PAID\n\nOn Wed, Nov 24, 2026 at 1:00 PM Sarah <s@example.com> wrote:\n> old', 'PAID'],
    ['NOT OURS\n\n-----Original Message-----\nFrom: Mailkeep\nSent: today', 'NOT OURS'],
    ['YES\n\nFrom: Mailkeep <mail@example.com>\nSent: today\nTo: Sarah', 'YES'],
    ['SCAM\n> quoted line\nmore quoted text', 'SCAM'],
  ])('keeps only the answer', (text, expected) => {
    expect(stripQuotedText(text)).toBe(expected);
  });
});

describe('second-notice alert replies', () => {
  it('marks the matching open second-notice case paid from an exact PAID reply', async () => {
    const alertId = seedAlert();
    const afterAnswer = vi.fn().mockResolvedValue(undefined);
    const outcome = await handleAlertReply(
      { ...deps(), afterAnswer },
      { alertId, memberId: familyId, text: 'PAID', via: 'email' },
    );
    expect(outcome).toBe('answered');
    expect(afterAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: newCaseId, letterId, lane: 'handled' }),
    );
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get(newCaseId) as { status: string })
        .status,
    ).toBe('paid');
    expect(
      (db.prepare('SELECT lane FROM letters WHERE id = ?').get(letterId) as { lane: string }).lane,
    ).toBe('handled');
  });

  it('rejects unclear text, the parent role, and a non-second-notice case', async () => {
    const alertId = seedAlert();
    expect(
      await handleAlertReply(deps(), {
        alertId,
        memberId: familyId,
        text: 'maybe tomorrow',
        via: 'email',
      }),
    ).toBe('unclear');
    expect(
      await handleAlertReply(deps(), { alertId, memberId: parentId, text: 'PAID', via: 'email' }),
    ).toBe('ignored');
    seedAlert(false);
    expect(
      await handleAlertReply(deps(), { alertId, memberId: familyId, text: 'PAID', via: 'email' }),
    ).toBe('ignored');
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get(newCaseId) as { status: string })
        .status,
    ).toBe('open');
  });
});

describe('ask answer effects', () => {
  it('accepts a forced link and joins the existing case', () => {
    const askId = seedAsk('link', [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]);
    const result = applyAskAnswer(db, { askId, memberId: familyId, answer: 'yes', via: 'email' });
    expect(result?.caseId).toBe(pastCaseId);
    expect(
      db.prepare('SELECT case_id, lane FROM letters WHERE id = ?').get(letterId) as {
        case_id: string;
        lane: string;
      },
    ).toEqual({ case_id: pastCaseId, lane: 'headsup' });
    expect(
      (
        db
          .prepare('SELECT status FROM relations WHERE letter_id = ? AND other_letter_id = ?')
          .get(letterId, pastId) as {
          status: string;
        }
      ).status,
    ).toBe('accepted');
    const events = db
      .prepare('SELECT type FROM case_events WHERE case_id = ? ORDER BY created_at')
      .all(pastCaseId) as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['asked', 'linked', 'answered']),
    );
  });

  it('rejects an offered link and keeps a separate case', () => {
    const askId = seedAsk('link', [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]);
    applyAskAnswer(db, { askId, memberId: familyId, answer: 'no', via: 'email' });
    expect(
      (
        db
          .prepare(
            "SELECT status FROM relations WHERE letter_id = ? AND other_letter_id = ? AND status = 'rejected'",
          )
          .get(letterId, pastId) as {
          status: string;
        }
      ).status,
    ).toBe('rejected');
    expect(
      (
        db.prepare('SELECT case_id FROM letters WHERE id = ?').get(letterId) as {
          case_id: string | null;
        }
      ).case_id,
    ).not.toBe(pastCaseId);
  });

  it('marks a paid case paid and the letter handled', () => {
    db.prepare('UPDATE letters SET case_id = ? WHERE id = ?').run(pastCaseId, letterId);
    const askId = seedAsk(
      'paid',
      [
        { value: 'paid', label: 'Paid' },
        { value: 'not_paid', label: 'Not paid' },
        { value: 'not_ours', label: 'Not ours' },
      ],
      pastCaseId,
    );
    applyAskAnswer(db, { askId, memberId: familyId, answer: 'paid', via: 'email' });
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get(pastCaseId) as { status: string })
        .status,
    ).toBe('paid');
    expect(
      db.prepare('SELECT lane, amount_cents FROM letters WHERE id = ?').get(letterId) as {
        lane: string;
        amount_cents: null;
      },
    ).toEqual({
      lane: 'handled',
      amount_cents: null,
    });
  });

  it('records not paid without changing the case', () => {
    db.prepare('UPDATE letters SET case_id = ? WHERE id = ?').run(pastCaseId, letterId);
    const askId = seedAsk('paid', [{ value: 'not_paid', label: 'Not paid' }], pastCaseId);
    applyAskAnswer(db, { askId, memberId: familyId, answer: 'not_paid', via: 'web' });
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get(pastCaseId) as { status: string })
        .status,
    ).toBe('open');
    expect(
      (
        db.prepare('SELECT answered_via FROM asks WHERE id = ?').get(askId) as {
          answered_via: string;
        }
      ).answered_via,
    ).toBe('web');
  });

  it('closes a not-ours case', () => {
    db.prepare('UPDATE letters SET case_id = ? WHERE id = ?').run(pastCaseId, letterId);
    const askId = seedAsk('paid', [{ value: 'not_ours', label: 'Not ours' }], pastCaseId);
    applyAskAnswer(db, { askId, memberId: familyId, answer: 'not_ours', via: 'email' });
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get(pastCaseId) as { status: string })
        .status,
    ).toBe('closed');
  });

  it('forces scam and real answers through the router', () => {
    seedDecision({ scam_payment: { type: 'noul', noul: 0.95 } });
    const scamAsk = seedAsk('scam', [
      { value: 'scam', label: 'Scam' },
      { value: 'real', label: 'Real' },
    ]);
    applyAskAnswer(db, { askId: scamAsk, memberId: familyId, answer: 'real', via: 'email' });
    expect(
      db.prepare('SELECT lane, amount_cents FROM letters WHERE id = ?').get(letterId) as {
        lane: string;
        amount_cents: number;
      },
    ).toEqual({
      lane: 'headsup',
      amount_cents: 10000,
    });
    const checkAsk = seedAsk('check', [{ value: 'scam', label: 'Scam' }]);
    applyAskAnswer(db, { askId: checkAsk, memberId: familyId, answer: 'scam', via: 'email' });
    expect(
      db.prepare('SELECT lane, amount_cents FROM letters WHERE id = ?').get(letterId) as {
        lane: string;
        amount_cents: null;
      },
    ).toEqual({
      lane: 'careful',
      amount_cents: null,
    });
  });

  it('forces a chosen kind and closes handled checks', () => {
    seedDecision({
      kind: {
        type: 'choice',
        choice: 'other',
        confidence: 0.4,
        probabilities: { other: 0.4, government: 0.35, bill: 0.25 },
      },
    });
    const kindAsk = seedAsk('kind', [{ value: 'government', label: 'Government' }]);
    applyAskAnswer(db, { askId: kindAsk, memberId: familyId, answer: 'government', via: 'email' });
    expect(
      db.prepare('SELECT kind, lane FROM letters WHERE id = ?').get(letterId) as {
        kind: string;
        lane: string;
      },
    ).toEqual({
      kind: 'government',
      lane: 'needs_you',
    });
    const checkAsk = seedAsk('check', [{ value: 'handled_it', label: 'Handled it' }]);
    applyAskAnswer(db, { askId: checkAsk, memberId: familyId, answer: 'handled_it', via: 'email' });
    expect(
      (db.prepare('SELECT status FROM cases WHERE id = ?').get(newCaseId) as { status: string })
        .status,
    ).toBe('closed');
  });

  it('rejects a parent answering a family ask', () => {
    const askId = seedAsk('check', [{ value: 'handled_it', label: 'Handled it' }]);
    expect(
      applyAskAnswer(db, { askId, memberId: parentId, answer: 'handled_it', via: 'email' }),
    ).toBeNull();
    expect(
      (db.prepare('SELECT status FROM asks WHERE id = ?').get(askId) as { status: string }).status,
    ).toBe('open');
  });
});

describe('reply classification', () => {
  it('accepts an exact option reply without calling the model', async () => {
    const askId = seedAsk('link', [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]);
    const classify = vi.fn();
    const runtime = { ...deps(), classify, afterAnswer: vi.fn() };
    expect(
      await handleAskReply(runtime, { askId, memberId: familyId, text: 'NO', via: 'email' }),
    ).toBe('answered');
    expect(classify).not.toHaveBeenCalled();
    expect(
      db.prepare('SELECT status, answer_key FROM asks WHERE id = ?').get(askId) as {
        status: string;
        answer_key: string;
      },
    ).toEqual({ status: 'answered', answer_key: 'no' });
  });

  it('queues one clarification for a low-confidence reply', async () => {
    const askId = seedAsk('check', [{ value: 'handled_it', label: 'Handled it' }]);
    const classify = vi.fn().mockResolvedValue({ choice: 'handled_it', confidence: 0.5 });
    const runtime = { ...deps(), classify, afterAnswer: vi.fn() };
    expect(
      await handleAskReply(runtime, { askId, memberId: familyId, text: 'done', via: 'email' }),
    ).toBe('unclear');
    expect(
      await handleAskReply(runtime, { askId, memberId: familyId, text: 'done', via: 'email' }),
    ).toBe('unclear');
    expect((db.prepare('SELECT count(*) AS n FROM outbox').get() as { n: number }).n).toBe(1);
    expect(
      (db.prepare('SELECT status FROM asks WHERE id = ?').get(askId) as { status: string }).status,
    ).toBe('open');
  });

  it('passes stripped natural language to the classifier and applies a confident answer', async () => {
    const askId = seedAsk('check', [{ value: 'handled_it', label: 'Handled it' }]);
    const classify = vi.fn().mockResolvedValue({ choice: 'handled_it', confidence: 0.9 });
    const runtime = { ...deps(), classify, afterAnswer: vi.fn() };
    expect(
      await handleAskReply(runtime, {
        askId,
        memberId: familyId,
        text: 'I took care of it yesterday\n\nOn Tue, Nov 24, 2026, Sarah wrote:\n> old message',
        via: 'email',
      }),
    ).toBe('answered');
    expect(classify.mock.calls[0]?.[0].text).toBe('I took care of it yesterday');
    expect(
      (db.prepare('SELECT status FROM asks WHERE id = ?').get(askId) as { status: string }).status,
    ).toBe('answered');
  });
});
