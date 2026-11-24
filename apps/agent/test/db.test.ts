import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDb } from '../src/db/db.js';
import { migrate, SCHEMA_VERSION } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';

let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-db-'));
  db = openDb(path.join(directory, 'test.db'));
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('database foundation', () => {
  it('migrates once and records the schema version', () => {
    migrate(db);
    migrate(db);
    const row = db.prepare("SELECT v FROM kv WHERE k = 'schema_version'").get() as { v: string };
    expect(row.v).toBe(String(SCHEMA_VERSION));
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'letters'").get(),
    ).toBeDefined();
  });

  it('creates households and enforces unique member emails', () => {
    migrate(db);
    const household = createHousehold(db, {
      name: "Ruth's mail",
      parentDisplay: 'Ruth',
      timezone: 'America/Chicago',
      demo: false,
    });
    addMember(db, {
      householdId: household.id,
      email: 'Kiter7396@Gmail.com',
      displayName: 'Sarah',
      role: 'family',
    });
    expect(() =>
      addMember(db, {
        householdId: household.id,
        email: 'kiter7396@gmail.com',
        displayName: 'Sarah again',
        role: 'family',
      }),
    ).toThrow(/UNIQUE/i);
  });
});
