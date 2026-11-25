import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileLetter } from '../src/act/box.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { createHousehold } from '../src/db/repo.js';
import type { GatewayClient } from '../src/gateway/client.js';
import type { RouteOutput } from '../src/pipeline/route.js';

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  listItems: vi.fn(),
  uploadFile: vi.fn(),
  uploadNewVersion: vi.fn(),
}));
vi.mock('../src/providers/box.js', () => mocks);

let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-box-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  createHousehold(db, {
    id: 'hh_demo',
    name: 'Demo',
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    demo: true,
  });
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, box_folder_id, created_at, updated_at)
     VALUES ('case_1', 'hh_demo', 'Water bill', 'Riverbend', 'bill', 'open', 'case_folder', ?, ?)`,
  ).run(now, now);
  vi.clearAllMocks();
  mocks.listItems.mockResolvedValue({ entries: [] });
  mocks.createFolder.mockImplementation(async ({ name }: { name: string }) => ({
    id: `folder_${name}`,
    type: 'folder',
    name,
  }));
  mocks.uploadFile.mockImplementation(async ({ name }: { name: string }) => ({
    entries: [{ id: `file_${name}`, type: 'file', name }],
  }));
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('trial Box filing', () => {
  it('files the trial original and note without writing case.md', async () => {
    const localPath = path.join(directory, 'trial.jpg');
    await writeFile(localPath, Buffer.from([0xff, 0xd8, 0xff]));
    const route: RouteOutput = {
      lane: 'needs_you',
      kind: 'collection',
      amountCents: null,
      dueDate: '2026-12-16',
      relations: [],
      caseChange: {
        action: 'update',
        caseId: 'case_1',
        title: 'Past Due Water Bill Notice',
        counterparty: 'Riverbend',
        kind: 'collection',
        status: 'open',
        amountCents: null,
        dueDate: '2026-12-16',
        secondNotice: true,
        contradiction: false,
      },
      asks: [],
      notes: [],
      checks: [],
      familyAlert: true,
    };
    await fileLetter({} as GatewayClient, db, {
      householdId: 'hh_demo',
      letter: {
        id: 'ltr_trial',
        title: 'Past Due Water Bill Notice',
        received_at: '2026-12-09T12:00:00.000Z',
        local_path: localPath,
        mime: 'image/jpeg',
        summary_parent: 'Past due',
        todo_parent: 'Pay',
        transcript: 'Transcript',
        lane: 'needs_you',
        box_file_id: null,
        trial: 1,
      },
      route,
      caseId: 'case_1',
      caseChange: route.caseChange,
      checks: [],
      modelIds: ['jev-test'],
    });
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadNewVersion).not.toHaveBeenCalled();
    expect(
      (
        db.prepare('SELECT box_casefile_id FROM cases WHERE id = ?').get('case_1') as {
          box_casefile_id: string | null;
        }
      ).box_casefile_id,
    ).toBeNull();
  });
});
