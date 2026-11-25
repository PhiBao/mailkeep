import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncPendingCaseFiles } from '../src/act/case-sync.js';
import { queueCaseFileSync } from '../src/cases/repo.js';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import type { GatewayClient } from '../src/gateway/client.js';

const mocks = vi.hoisted(() => ({ updateCaseFile: vi.fn() }));
vi.mock('../src/act/box.js', () => ({ updateCaseFile: mocks.updateCaseFile }));

let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-case-sync-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cases
      (id, household_id, title, counterparty, kind, status, created_at, updated_at)
     VALUES ('case_1', 'hh_1', 'Water bill', 'Cedar', 'bill', 'paid', ?, ?)`,
  ).run(now, now);
  vi.clearAllMocks();
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

function deps() {
  const config = loadConfig({ MAILKEEP_DATA_DIR: directory });
  return { db, client: {} as GatewayClient, config };
}

describe('durable case file sync', () => {
  it('drains a queued case sync and removes the marker only after success', async () => {
    queueCaseFileSync(db, 'hh_1', 'case_1');
    mocks.updateCaseFile.mockResolvedValueOnce(undefined);
    await syncPendingCaseFiles(deps());
    expect(mocks.updateCaseFile).toHaveBeenCalledWith(
      expect.anything(),
      db,
      expect.objectContaining({ householdId: 'hh_1', caseId: 'case_1' }),
    );
    expect(db.prepare("SELECT v FROM kv WHERE k = 'case-sync:hh_1:case_1'").get()).toBeUndefined();
  });

  it('keeps the marker when Box fails so the next worker pass can retry', async () => {
    queueCaseFileSync(db, 'hh_1', 'case_1');
    mocks.updateCaseFile.mockRejectedValueOnce(new Error('Box unavailable'));
    await syncPendingCaseFiles(deps());
    expect(db.prepare("SELECT v FROM kv WHERE k = 'case-sync:hh_1:case_1'").get()).toBeDefined();
    mocks.updateCaseFile.mockResolvedValueOnce(undefined);
    await syncPendingCaseFiles(deps());
    expect(mocks.updateCaseFile).toHaveBeenCalledTimes(2);
    expect(db.prepare("SELECT v FROM kv WHERE k = 'case-sync:hh_1:case_1'").get()).toBeUndefined();
  });

  it('shares one in-flight sync pass per database', async () => {
    queueCaseFileSync(db, 'hh_1', 'case_1');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.updateCaseFile.mockImplementation(async () => gate);
    const first = syncPendingCaseFiles(deps());
    const second = syncPendingCaseFiles(deps());
    expect(mocks.updateCaseFile).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    expect(mocks.updateCaseFile).toHaveBeenCalledTimes(1);
  });
});
