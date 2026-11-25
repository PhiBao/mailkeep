import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCase, saveCaseChange } from '../src/cases/repo.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import type { CaseChange } from '../src/pipeline/route.js';

let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-cases-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

function seedCase() {
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, account_tail, kind, status, amount_cents, due_date,
       second_notice, contradiction, created_at, updated_at)
     VALUES ('case_1', 'hh_1', 'Water bill', 'Cedar Valley Water Utility', '7782', 'bill', 'overdue',
             8417, '2026-11-20', 1, 1, '2026-11-01T00:00:00Z', '2026-11-20T00:00:00Z')`,
  ).run();
}

function change(overrides: Partial<CaseChange> = {}): CaseChange {
  return {
    action: 'update',
    caseId: 'case_1',
    title: 'Past Due Water Bill Notice',
    counterparty: 'Cedar Valley Water Utility',
    accountTail: null,
    kind: 'collection',
    status: 'overdue',
    amountCents: null,
    dueDate: null,
    secondNotice: false,
    contradiction: false,
    ...overrides,
  };
}

describe('case history merging', () => {
  it('preserves known amount, due date, account tail and sticky flags on a sparse update', () => {
    seedCase();
    saveCaseChange(db, { householdId: 'hh_1', letterId: 'ltr_2', change: change() });
    expect(getCase(db, 'hh_1', 'case_1')).toMatchObject({
      amount_cents: 8417,
      due_date: '2026-11-20',
      account_tail: '7782',
      second_notice: 1,
      contradiction: 1,
      kind: 'collection',
      status: 'overdue',
    });
  });

  it('uses a new amount or due date when the linked letter establishes one', () => {
    seedCase();
    saveCaseChange(db, {
      householdId: 'hh_1',
      letterId: 'ltr_2',
      change: change({ amountCents: 8917, dueDate: '2026-12-02', accountTail: '7782' }),
    });
    expect(getCase(db, 'hh_1', 'case_1')).toMatchObject({
      amount_cents: 8917,
      due_date: '2026-12-02',
    });
  });

  it('clears the amount on a paid transition but keeps due history and flags', () => {
    seedCase();
    saveCaseChange(db, {
      householdId: 'hh_1',
      letterId: 'ltr_2',
      change: change({ action: 'paid', status: 'paid', amountCents: 8917 }),
    });
    expect(getCase(db, 'hh_1', 'case_1')).toMatchObject({
      status: 'paid',
      amount_cents: null,
      due_date: '2026-11-20',
      second_notice: 1,
      contradiction: 1,
    });
  });

  it('stores the account tail when a pipeline creates a new case', () => {
    const caseId = saveCaseChange(db, {
      householdId: 'hh_1',
      letterId: 'ltr_1',
      change: change({
        action: 'open',
        caseId: null,
        title: 'November Water Bill',
        kind: 'bill',
        status: 'open',
        accountTail: '7782',
        amountCents: 8417,
        dueDate: '2026-11-20',
      }),
    });
    expect(getCase(db, 'hh_1', caseId)).toMatchObject({ account_tail: '7782' });
  });
});
